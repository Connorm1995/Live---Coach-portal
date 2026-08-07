/**
 * Database backup to Cloudflare R2.
 *
 * Produces a plain SQL dump, gzips it, and uploads it. Plain SQL is chosen
 * deliberately over a custom format: it can be restored by this tool, by psql,
 * or read by eye in a text editor. A backup that can only be restored by the
 * program that wrote it is a hostage, not a backup.
 *
 * WHY NOT pg_dump: it is not installed on the Railway container and adding it
 * means changing the build. Everything here runs on the pg driver already in
 * the project, so it works identically locally and in production.
 *
 * ESCAPING IS DONE BY POSTGRES, NOT BY US. Every value is rendered with
 * quote_nullable(col::text) inside the SELECT, so Postgres itself produces the
 * literal. Hand-rolling quoting in JavaScript for bytea, jsonb, timestamps and
 * text would be a rich source of silent corruption discovered only on the day
 * a restore is actually needed.
 */

const zlib = require('zlib');
const { promisify } = require('util');
const pool = require('../db/pool');
const r2 = require('./r2');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const PREFIX = 'postgres/';
const KEEP_DAILY = 30;
const KEEP_MONTHLY = 12;

/**
 * Tables ordered so that a parent is always restored before its children.
 *
 * Restoring in arbitrary order fails on foreign keys. The usual shortcut is
 * SET session_replication_role = replica, but that needs superuser and is not
 * guaranteed on a managed database, so the order is computed properly instead.
 * A cycle (should never occur here) falls back to alphabetical rather than
 * looping forever.
 */
async function tablesInDependencyOrder(client = pool) {
  const { rows: tables } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const names = tables.map((t) => t.tablename);

  const { rows: deps } = await client.query(
    `SELECT DISTINCT
       c.conrelid::regclass::text  AS child,
       c.confrelid::regclass::text AS parent
     FROM pg_constraint c
     WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`
  );

  const dependsOn = new Map(names.map((n) => [n, new Set()]));
  for (const d of deps) {
    // Self-references impose no ordering between tables.
    if (d.child === d.parent) continue;
    if (dependsOn.has(d.child) && names.includes(d.parent)) dependsOn.get(d.child).add(d.parent);
  }

  const ordered = [];
  const placed = new Set();
  let guard = names.length + 1;
  while (ordered.length < names.length && guard-- > 0) {
    for (const n of names) {
      if (placed.has(n)) continue;
      if ([...dependsOn.get(n)].every((p) => placed.has(p))) {
        ordered.push(n);
        placed.add(n);
      }
    }
  }
  for (const n of names) if (!placed.has(n)) ordered.push(n); // cycle fallback
  return ordered;
}

// Rows per INSERT statement. Batching matters twice over: it keeps the file
// far smaller than one statement per row, and it keeps each statement small
// enough to send comfortably. Restoring 167k individual statements one at a
// time is slow; sending the whole file as one statement resets the connection.
const ROWS_PER_INSERT = 500;

/** Build the SQL for one table: a TRUNCATE plus batched multi-row INSERTs. */
async function dumpTable(table, delimiter) {
  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  if (cols.length === 0) return { sql: '', rows: 0 };

  const colList = cols.map((c) => `"${c.column_name}"`).join(', ');
  // Postgres renders every literal, including bytea hex and jsonb.
  const tupleExpr = cols.map((c) => `quote_nullable("${c.column_name}"::text)`).join(` || ',' || `);

  const { rows } = await pool.query(`SELECT ${tupleExpr} AS tuple FROM "${table}"`);

  let sql = `\n-- ${table} (${rows.length} rows)\n`;
  sql += `TRUNCATE TABLE "${table}" CASCADE;\n${delimiter}\n`;

  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const batch = rows.slice(i, i + ROWS_PER_INSERT);
    sql += `INSERT INTO "${table}" (${colList}) VALUES\n`;
    sql += batch.map((r) => `(${r.tuple})`).join(',\n');
    sql += `;\n${delimiter}\n`;
  }
  return { sql, rows: rows.length };
}

/** Sequence positions, so IDs continue rather than colliding after a restore. */
async function dumpSequences(delimiter) {
  const { rows } = await pool.query(
    `SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename`
  );
  if (rows.length === 0) return '';

  let sql = '\n-- Sequences\n';
  for (const { sequencename } of rows) {
    const { rows: v } = await pool.query(`SELECT last_value, is_called FROM "${sequencename}"`);
    if (!v[0]) continue;
    sql += `SELECT setval('"${sequencename}"', ${v[0].last_value}, ${v[0].is_called});\n${delimiter}\n`;
  }
  return sql;
}

/**
 * Full dump as a single SQL string.
 *
 * Statements are separated by a delimiter line carrying a random id generated
 * per dump, recorded in the header. Restore splits on that rather than on
 * semicolons or newlines, both of which appear inside clients' free-text
 * answers and would corrupt the split. A random id cannot collide with content.
 */
async function buildDump() {
  const started = Date.now();
  const order = await tablesInDependencyOrder();
  const id = require('crypto').randomBytes(12).toString('hex');
  const delimiter = `-- @@STMT-${id}@@`;

  let sql = `-- MyFitCoach database backup\n`;
  sql += `-- Taken: ${new Date().toISOString()}\n`;
  sql += `-- Tables: ${order.length} (restore order respects foreign keys)\n`;
  sql += `-- Statement delimiter: ${delimiter}\n`;
  sql += `--\n-- Restore:  node backend/db/backup.js restore <key> --into "<connection string>"\n`;
  sql += `--\n-- Wrapped in a transaction: it either all lands or none of it does.\n\n`;
  sql += `BEGIN;\n${delimiter}\n`;

  const counts = {};
  for (const table of order) {
    const { sql: chunk, rows } = await dumpTable(table, delimiter);
    sql += chunk;
    counts[table] = rows;
  }
  sql += await dumpSequences(delimiter);
  sql += `\nCOMMIT;\n${delimiter}\n`;

  return { sql, counts, delimiter, tables: order.length, ms: Date.now() - started };
}

/**
 * Split a dump into executable statements using the delimiter recorded in its
 * own header. Falls back to an error rather than guessing, because a wrong
 * split silently corrupts data.
 */
function splitStatements(sql) {
  const m = sql.match(/^-- Statement delimiter: (.+)$/m);
  if (!m) throw new Error('Dump has no statement delimiter header - refusing to guess how to split it');
  const delimiter = m[1].trim();
  return sql.split(new RegExp(`^${delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
    .map((s) => s.trim())
    .filter((s) => s && !/^(--[^\n]*\n?)+$/.test(s));
}

function backupKey(date = new Date()) {
  return `${PREFIX}${date.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z')}.sql.gz`;
}

/** Take a backup and upload it. Returns a summary. */
async function runBackup() {
  if (!r2.isConfigured()) throw new Error('R2 is not configured - backup skipped');

  const { sql, counts, tables, ms } = await buildDump();
  const raw = Buffer.from(sql, 'utf8');
  const gz = await gzip(raw, { level: 9 });
  const key = backupKey();

  await r2.put(key, gz, 'application/gzip');

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    key,
    tables,
    rows: totalRows,
    rawBytes: raw.length,
    gzBytes: gz.length,
    ms: Date.now() - (Date.now() - ms),
    dumpMs: ms,
    counts,
  };
}

/**
 * Delete old backups: keep the most recent KEEP_DAILY, plus the first backup
 * of each of the last KEEP_MONTHLY months. Anything else goes.
 */
async function prune() {
  const objects = await r2.list(PREFIX);           // newest first
  if (objects.length === 0) return { kept: 0, deleted: 0 };

  const keep = new Set();
  objects.slice(0, KEEP_DAILY).forEach((o) => keep.add(o.key));

  // Oldest-first pass so the first backup seen in a month is the earliest one.
  const byMonth = new Map();
  for (const o of [...objects].reverse()) {
    const month = o.key.slice(PREFIX.length, PREFIX.length + 7); // YYYY-MM
    if (!byMonth.has(month)) byMonth.set(month, o.key);
  }
  [...byMonth.entries()].slice(-KEEP_MONTHLY).forEach(([, k]) => keep.add(k));

  const doomed = objects.filter((o) => !keep.has(o.key));
  for (const o of doomed) await r2.del(o.key);

  return { kept: keep.size, deleted: doomed.length, total: objects.length };
}

/** List stored backups, newest first. */
async function listBackups() {
  return r2.list(PREFIX);
}

/** Fetch and decompress one backup into SQL text. */
async function fetchBackupSql(key) {
  const gz = await r2.get(key);
  if (!gz) throw new Error(`Backup not found: ${key}`);
  return (await gunzip(gz)).toString('utf8');
}

module.exports = {
  PREFIX,
  KEEP_DAILY,
  KEEP_MONTHLY,
  tablesInDependencyOrder,
  buildDump,
  splitStatements,
  runBackup,
  prune,
  listBackups,
  fetchBackupSql,
};
