const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        trainerize_id VARCHAR,
        name VARCHAR NOT NULL,
        email VARCHAR,
        program VARCHAR CHECK (program IN ('my_fit_coach', 'my_fit_coach_core')),
        pending_setup BOOLEAN NOT NULL DEFAULT false,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Additive migrations for existing tables
    await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS email VARCHAR`);
    await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS pending_setup BOOLEAN NOT NULL DEFAULT false`);

    // Make program nullable (drop NOT NULL if it exists)
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE clients ALTER COLUMN program DROP NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    // Add current_phase column
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS current_phase VARCHAR
      CHECK (current_phase IN ('recomp', 'fat_loss', 'building', 'maintenance'))
    `);

    // Add trainerize_joined_at column (when client was first added in Trainerize)
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS trainerize_joined_at TIMESTAMPTZ
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS checkins (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        type VARCHAR NOT NULL CHECK (type IN ('weekly', 'eom_report')),
        typeform_response_id VARCHAR UNIQUE,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        responded BOOLEAN NOT NULL DEFAULT false,
        responded_at TIMESTAMPTZ,
        cycle_start DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_checkins_client_cycle
      ON checkins (client_id, cycle_start);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_checkins_responded
      ON checkins (responded, cycle_start);
    `);

    // Add form_data column to checkins (stores full Typeform answers as JSONB)
    await client.query(`ALTER TABLE checkins ADD COLUMN IF NOT EXISTS form_data JSONB`);

    // Weekly focus table - coach's priority notes per client per week
    await client.query(`
      CREATE TABLE IF NOT EXISTS weekly_focus (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        week_start DATE NOT NULL,
        focus_text TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, client_id, week_start)
      );
    `);

    // Client settings table - per-client configurable values
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_settings (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        step_target INTEGER DEFAULT 10000,
        phase_rate_min NUMERIC(4,2),
        phase_rate_max NUMERIC(4,2),
        phase_start_date DATE,
        phase_start_weight NUMERIC(5,1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, client_id)
      );
    `);

    // Weight trajectory overlay settings (independent of client header phase)
    await client.query(`
      CREATE TABLE IF NOT EXISTS weight_trajectory_settings (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        phase_type VARCHAR NOT NULL CHECK (phase_type IN ('fat_loss','building','recomp','maintenance')),
        start_date DATE NOT NULL,
        end_date DATE,
        min_rate NUMERIC(4,2),
        max_rate NUMERIC(4,2),
        lower_band NUMERIC(5,1),
        upper_band NUMERIC(5,1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, client_id)
      );
    `);

    // Add block_start_date to client_settings
    await client.query(`
      ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS block_start_date DATE
    `);

    // Key lift targets table - coach sets per-client lift goals
    await client.query(`
      CREATE TABLE IF NOT EXISTS key_lift_targets (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        exercise_name VARCHAR NOT NULL,
        exercise_id INTEGER,
        target_type VARCHAR NOT NULL,
        target_weight NUMERIC(6,1) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Expand target_type constraint to support bodyweight reps and time targets
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE key_lift_targets DROP CONSTRAINT IF EXISTS key_lift_targets_target_type_check;
        ALTER TABLE key_lift_targets ADD CONSTRAINT key_lift_targets_target_type_check
          CHECK (target_type IN ('1rm', '5rm', '10rm', 'max_reps', 'max_time'));
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_key_lift_targets_client
      ON key_lift_targets (client_id, coach_id);
    `);

    // Drop weight_test_sessions table (no longer used)
    await client.query(`DROP TABLE IF EXISTS weight_test_sessions`);

    // Data error flags - manual overrides for data entry errors
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_error_flags (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        workout_id INTEGER NOT NULL,
        exercise_name VARCHAR NOT NULL,
        set_num INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, client_id, workout_id, exercise_name, set_num)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_data_error_flags_client
      ON data_error_flags (client_id, coach_id);
    `);

    // Add mfp_url column to clients (MyFitnessPal diary URL)
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS mfp_url VARCHAR
    `);

    // Add fibre_target column to client_settings (default 20g)
    await client.query(`
      ALTER TABLE client_settings ADD COLUMN IF NOT EXISTS fibre_target INTEGER DEFAULT 20
    `);

    // Scheduled messages table - DMs scheduled for future send
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        body TEXT NOT NULL,
        send_at TIMESTAMPTZ NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
        trainerize_thread_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
      ON scheduled_messages (status, send_at) WHERE status = 'pending';
    `);

    // Add file_token and file_name columns to scheduled_messages for attachments
    await client.query(`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS file_token VARCHAR`);
    await client.query(`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS file_name VARCHAR`);

    // Scheduled posts table - group posts scheduled for future send
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        group_thread_id INTEGER NOT NULL,
        body TEXT NOT NULL,
        send_at TIMESTAMPTZ NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_posts_pending
      ON scheduled_posts (status, send_at) WHERE status = 'pending';
    `);

    // Add file_token, file_name, cancelled_at, sent_at columns to scheduled_posts
    await client.query(`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS file_token VARCHAR`);
    await client.query(`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS file_name VARCHAR`);
    await client.query(`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`);

    // Expand scheduled_posts status constraint to include 'cancelled'
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_status_check;
        ALTER TABLE scheduled_posts ADD CONSTRAINT scheduled_posts_status_check
          CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'));
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    // Coach settings table - global coach preferences (reminders toggle etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS coach_settings (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL UNIQUE,
        reminders_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Reminder logs table - prevents duplicate reminder sends per cycle
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminder_logs (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        reminder_type VARCHAR NOT NULL CHECK (reminder_type IN ('weekly_checkin', 'eom_report')),
        cycle_start DATE NOT NULL,
        sent BOOLEAN NOT NULL DEFAULT false,
        skipped_reason VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, client_id, reminder_type, cycle_start)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reminder_logs_cycle
      ON reminder_logs (coach_id, reminder_type, cycle_start);
    `);

    // Add file_data column to scheduled_posts and scheduled_messages for storing file binary
    await client.query(`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS file_data BYTEA`);
    await client.query(`ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS file_content_type VARCHAR`);
    await client.query(`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS file_data BYTEA`);
    await client.query(`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS file_content_type VARCHAR`);

    // Add reminders_enabled column to clients (per-client reminder override)
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT true
    `);

    // Add separate program-level reminder toggles to coach_settings
    await client.query(`
      ALTER TABLE coach_settings ADD COLUMN IF NOT EXISTS mfc_reminders_enabled BOOLEAN NOT NULL DEFAULT true
    `);
    await client.query(`
      ALTER TABLE coach_settings ADD COLUMN IF NOT EXISTS core_reminders_enabled BOOLEAN NOT NULL DEFAULT true
    `);

    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
