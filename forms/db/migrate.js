/**
 * MyFitCoach Forms migrations.
 *
 * Creates the tables owned by MyFitCoach Forms:
 *   - form_links:  one permanent token per client per coach - the client's
 *                  personal form URL (forms.myfitcoach.ie/checkin/<token>)
 *   - form_drafts: save-as-you-go answers, one draft per client per form type
 *                  per cycle. Deleted after successful submit.
 *
 * Final submissions are written to the existing `checkins` table (shared with
 * the coach portal) in the same shape the Typeform webhook produced, so all
 * downstream portal code works unchanged.
 *
 * Usage: node forms/db/migrate.js
 */

const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS form_links (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        token VARCHAR NOT NULL UNIQUE,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (coach_id, client_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_form_links_token ON form_links (token);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS form_drafts (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        form_type VARCHAR NOT NULL CHECK (form_type IN ('weekly', 'eom_report')),
        cycle_start DATE NOT NULL,
        submission_uuid VARCHAR NOT NULL,
        answers JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (client_id, form_type, cycle_start)
      );
    `);

    // Onboarding: public form, no client token yet - drafts are keyed by an
    // anonymous submission UUID the browser holds in localStorage.
    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_drafts (
        submission_uuid VARCHAR PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        answers JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Every submission is stored here first, then synced to Trainerize.
    // status: synced | sync_failed. Failed rows keep the error and can be
    // retried from the admin area - the client's answers are never lost.
    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_submissions (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        submission_uuid VARCHAR NOT NULL UNIQUE,
        answers JSONB NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'sync_failed' CHECK (status IN ('synced', 'sync_failed')),
        trainerize_user_id BIGINT,
        client_id INTEGER REFERENCES clients(id),
        sync_error TEXT,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // ---- Shared-link migration (Aug 2026) ----
    //
    // The weekly and EOM forms moved from one token per client to a single
    // public link for everybody, with the client naming themselves at Q1.
    // A draft therefore belongs to a browser, not a client - we do not know
    // who they are until they have typed their name.

    await client.query(`ALTER TABLE form_drafts ALTER COLUMN client_id DROP NOT NULL`);

    // Drop the old (client_id, form_type, cycle_start) uniqueness, whatever
    // Postgres happened to name it, and key drafts on the browser's UUID.
    await client.query(`
      DO $$
      DECLARE con text;
      BEGIN
        SELECT conname INTO con
        FROM pg_constraint
        WHERE conrelid = 'form_drafts'::regclass AND contype = 'u'
          AND array_length(conkey, 1) = 3;
        IF con IS NOT NULL THEN
          EXECUTE format('ALTER TABLE form_drafts DROP CONSTRAINT %I', con);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_form_drafts_uuid
      ON form_drafts (submission_uuid);
    `);

    // Submissions whose typed name matched no client above the threshold.
    //
    // These are NOT written to `checkins` - that table requires a client_id,
    // and a NULL there would poison the reminder scheduler's NOT IN queries.
    // They live here with their answers intact until the coach assigns them,
    // at which point the row is inserted into checkins and marked resolved.
    // Nothing a client submits is ever discarded.
    await client.query(`
      CREATE TABLE IF NOT EXISTS unmatched_submissions (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        form_type VARCHAR NOT NULL CHECK (form_type IN ('weekly', 'eom_report')),
        cycle_start DATE NOT NULL,
        submission_uuid VARCHAR NOT NULL UNIQUE,
        submitted_name VARCHAR NOT NULL,
        best_match_client_id INTEGER REFERENCES clients(id),
        best_match_score NUMERIC(4,3),
        answers JSONB NOT NULL,
        form_data JSONB NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_client_id INTEGER REFERENCES clients(id),
        resolved_at TIMESTAMPTZ,
        resolved_checkin_id INTEGER REFERENCES checkins(id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_unmatched_pending
      ON unmatched_submissions (coach_id, resolved_at, submitted_at DESC);
    `);

    await client.query('COMMIT');
    console.log('Forms migrations complete: form_links, form_drafts (uuid-keyed), onboarding_drafts, onboarding_submissions, unmatched_submissions');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
