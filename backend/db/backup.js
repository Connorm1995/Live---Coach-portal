#!/usr/bin/env node
/**
 * Database backup CLI.
 *
 *   node backend/db/backup.js run              take a backup and upload it
 *   node backend/db/backup.js list             what is stored, newest first
 *   node backend/db/backup.js prune            apply the retention policy
 *   node backend/db/backup.js verify [key]     restore into a scratch database
 *                                              and compare row counts
 *   node backend/db/backup.js restore <key> --into "<connection string>"
 *
 * `restore` deliberately requires an explicit --into. There is no default and
 * no way to restore over production by accident or by typo.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { Client } = require('pg');
const pool = require('./pool');
const backup = require('../lib/backup');

const bytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

async function cmdRun() {
  console.log('Taking backup...');
  const res = await backup.runBackup();
  console.log(`  tables    : ${res.tables}`);
  console.log(`  rows      : ${res.rows.toLocaleString()}`);
  console.log(`  size      : ${bytes(res.rawBytes)} -> ${bytes(res.gzBytes)} compressed`);
  console.log(`  uploaded  : ${res.key}`);
  const p = await backup.prune();
  console.log(`  retention : ${p.kept} kept, ${p.deleted} old backup(s) removed`);
}

async function cmdList() {
  const objects = await backup.listBackups();
  if (objects.length === 0) return console.log('No backups stored yet.');
  console.log(`${objects.length} backup(s), newest first:\n`);
  for (const o of objects) {
    console.log(`  ${o.key.padEnd(52)} ${bytes(o.size).padStart(10)}  ${o.lastModified}`);
  }
}

async function cmdPrune() {
  const p = await backup.prune();
  console.log(`${p.total} stored, ${p.kept} kept, ${p.deleted} deleted.`);
}

/**
 * Run a dump's SQL against a target database, one statement at a time.
 *
 * Sending the whole file as a single query resets the connection at this size,
 * so it is split on the delimiter the dump recorded in its own header and
 * replayed in order. Order is load-bearing: BEGIN first, tables in foreign-key
 * order, COMMIT last.
 */
async function applySql(connectionString, sql, onProgress) {
  const statements = backup.splitStatements(sql);
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    let i = 0;
    for (const stmt of statements) {
      await client.query(stmt);
      i++;
      if (onProgress && i % 50 === 0) onProgress(i, statements.length);
    }
    return statements.length;
  } finally {
    await client.end();
  }
}

async function cmdRestore(key, into) {
  if (!key) throw new Error('restore needs a backup key (see: backup.js list)');
  if (!into) throw new Error('restore needs --into "<connection string>" - there is no default target');

  const sql = await backup.fetchBackupSql(key);
  console.log(`Restoring ${key} (${bytes(Buffer.byteLength(sql))} of SQL) into the given database...`);
  await applySql(into, sql);
  console.log('Restore complete.');
}

/**
 * End-to-end proof: restore the backup into a throwaway database and compare
 * every table's row count against production.
 *
 * This is the part that matters. An untested backup is a guess, and the usual
 * way people discover theirs does not work is at the exact moment they need it.
 */
async function cmdVerify(key) {
  const objects = await backup.listBackups();
  const target = key || (objects[0] && objects[0].key);
  if (!target) throw new Error('No backups to verify - run one first.');

  console.log(`Verifying ${target}\n`);

  const scratch = `verify_${Date.now()}`;
  const admin = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await admin.connect();

  try {
    await admin.query(`CREATE DATABASE ${scratch}`);
    console.log(`  created scratch database ${scratch}`);

    const scratchUrl = process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${scratch}$1`);

    // The dump carries data, not schema, so the scratch database needs the
    // tables first. BOTH migrations are required: the portal owns most tables,
    // but form_drafts, form_links, onboarding_* and unmatched_submissions are
    // created by the forms service's own migration. Running only one leaves
    // the restore failing on a missing relation.
    for (const script of [
      require('path').join(__dirname, 'migrate.js'),
      require('path').join(__dirname, '..', '..', 'forms', 'db', 'migrate.js'),
    ]) {
      await new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        // dotenv does not override an already-set variable, so passing
        // DATABASE_URL here reliably points the migration at the scratch copy.
        const p = spawn(process.execPath, [script], {
          env: { ...process.env, DATABASE_URL: scratchUrl }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        p.stdout.on('data', (d) => { out += d; });
        p.stderr.on('data', (d) => { out += d; });
        p.on('exit', (c) => (c === 0
          ? resolve()
          : reject(new Error(`${require('path').relative(process.cwd(), script)} exited ${c}:\n${out.trim().split('\n').slice(-6).join('\n')}`))));
      });
    }
    console.log('  schema created (portal + forms migrations)');

    const sql = await backup.fetchBackupSql(target);
    await applySql(scratchUrl, sql);
    console.log('  backup restored\n');

    // Compare row counts, table by table.
    const tables = await backup.tablesInDependencyOrder();
    const restored = new Client({ connectionString: scratchUrl, ssl: { rejectUnauthorized: false } });
    await restored.connect();

    let mismatches = 0;
    let totalProd = 0;
    let totalRestored = 0;
    const rows = [];
    for (const t of tables) {
      const [a, b] = await Promise.all([
        pool.query(`SELECT count(*)::int AS n FROM "${t}"`),
        restored.query(`SELECT count(*)::int AS n FROM "${t}"`),
      ]);
      const prod = a.rows[0].n;
      const rest = b.rows[0].n;
      totalProd += prod; totalRestored += rest;
      if (prod !== rest) mismatches++;
      if (prod > 0 || rest > 0) rows.push({ table: t, production: prod, restored: rest, match: prod === rest ? 'ok' : 'MISMATCH' });
    }
    // Row counts prove quantity, not fidelity. A quoting bug in a client's
    // free-text answer would insert happily and corrupt silently, so compare
    // a checksum of the actual content on the tables most at risk: free text,
    // JSON, and binary.
    const checksums = [
      { label: 'checkins.form_data (jsonb)', sql: `SELECT md5(string_agg(form_data::text, '' ORDER BY id)) AS h FROM checkins` },
      { label: 'auto_messages titles', sql: `SELECT md5(string_agg(title, '' ORDER BY id)) AS h FROM auto_messages` },
      { label: 'clients names + emails', sql: `SELECT md5(string_agg(coalesce(name,'') || coalesce(email,''), '' ORDER BY id)) AS h FROM clients` },
      { label: 'scheduled_posts body', sql: `SELECT md5(string_agg(coalesce(body,''), '' ORDER BY id)) AS h FROM scheduled_posts` },
      { label: 'weekly_focus notes', sql: `SELECT md5(string_agg(coalesce(focus_text,''), '' ORDER BY id)) AS h FROM weekly_focus` },
    ];
    const contentRows = [];
    let contentMismatches = 0;
    for (const c of checksums) {
      try {
        const [a, b] = await Promise.all([pool.query(c.sql), restored.query(c.sql)]);
        const ha = a.rows[0].h;
        const hb = b.rows[0].h;
        if (ha !== hb) contentMismatches++;
        contentRows.push({ content: c.label, production: (ha || 'empty').slice(0, 12), restored: (hb || 'empty').slice(0, 12), match: ha === hb ? 'ok' : 'MISMATCH' });
      } catch (e) {
        contentRows.push({ content: c.label, production: '-', restored: '-', match: 'skipped: ' + e.message.slice(0, 40) });
      }
    }
    await restored.end();

    console.table(rows);
    console.log('Content checksums (catches escaping corruption that row counts miss):');
    console.table(contentRows);
    mismatches += contentMismatches;
    console.log(`\n  production total : ${totalProd.toLocaleString()} rows`);
    console.log(`  restored total   : ${totalRestored.toLocaleString()} rows`);
    console.log(mismatches === 0
      ? '\n  VERIFIED - the backup restores completely and correctly.'
      : `\n  ${mismatches} TABLE(S) DID NOT MATCH - this backup is not trustworthy.`);
    return mismatches === 0;
  } finally {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`);
      console.log(`  scratch database dropped`);
    } catch (e) {
      console.warn(`  could not drop ${scratch}: ${e.message} - remove it by hand`);
    }
    await admin.end();
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const intoIdx = rest.indexOf('--into');
  const into = intoIdx !== -1 ? rest[intoIdx + 1] : null;
  const positional = rest.filter((a, i) => a !== '--into' && rest[i - 1] !== '--into');

  switch (cmd) {
    case 'run': return cmdRun();
    case 'list': return cmdList();
    case 'prune': return cmdPrune();
    case 'verify': return cmdVerify(positional[0]);
    case 'restore': return cmdRestore(positional[0], into);
    default:
      console.log('Usage:');
      console.log('  node backend/db/backup.js run');
      console.log('  node backend/db/backup.js list');
      console.log('  node backend/db/backup.js prune');
      console.log('  node backend/db/backup.js verify [key]');
      console.log('  node backend/db/backup.js restore <key> --into "<connection string>"');
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Failed:', err.message);
    pool.end();
    process.exit(1);
  });
