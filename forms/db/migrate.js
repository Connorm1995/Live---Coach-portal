/**
 * Forms service migrations.
 *
 * Creates the tables owned by the forms service:
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

    await client.query('COMMIT');
    console.log('Forms migrations complete: form_links, form_drafts, onboarding_drafts, onboarding_submissions');
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
