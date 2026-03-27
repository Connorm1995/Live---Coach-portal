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

    // Add objectives column (free-text client objectives)
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS objectives TEXT
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

    // =====================================================================
    // Persistent Trainerize data storage tables
    // =====================================================================

    // Body stats - one row per client per date
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_body_stats (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,
        body_weight NUMERIC(6,2),
        body_fat_percent NUMERIC(5,2),
        lean_body_mass NUMERIC(6,2),
        fat_mass NUMERIC(6,2),
        chest NUMERIC(6,2),
        shoulders NUMERIC(6,2),
        right_bicep NUMERIC(6,2),
        left_bicep NUMERIC(6,2),
        right_forearm NUMERIC(6,2),
        left_forearm NUMERIC(6,2),
        right_thigh NUMERIC(6,2),
        left_thigh NUMERIC(6,2),
        right_calf NUMERIC(6,2),
        left_calf NUMERIC(6,2),
        waist NUMERIC(6,2),
        hips NUMERIC(6,2),
        neck NUMERIC(6,2),
        resting_heart_rate INTEGER,
        blood_pressure_systolic INTEGER,
        blood_pressure_diastolic INTEGER,
        caliper_bf NUMERIC(5,2),
        fetched_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(coach_id, client_id, date)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_body_stats_client_date
      ON client_body_stats(client_id, date);
    `);

    // Sleep - one row per sleep segment per night
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_sleep (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        duration_seconds INTEGER,
        sleep_type VARCHAR DEFAULT 'asleep',
        fetched_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(coach_id, client_id, date, start_time)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sleep_client_date
      ON client_sleep(client_id, date);
    `);

    // Health data - one row per client per date per type (step, restingHeartRate, calorieOut)
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_health_data (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,
        type VARCHAR NOT NULL,
        value NUMERIC(10,2),
        fetched_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(coach_id, client_id, date, type)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_health_data_client_date
      ON client_health_data(client_id, date, type);
    `);

    // Nutrition - one row per client per date
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_nutrition (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,
        calories NUMERIC(8,2),
        protein NUMERIC(8,2),
        fat NUMERIC(8,2),
        carbs NUMERIC(8,2),
        fibre NUMERIC(8,2),
        saturated_fat NUMERIC(8,2),
        calories_goal NUMERIC(8,2),
        protein_goal NUMERIC(8,2),
        fat_goal NUMERIC(8,2),
        carbs_goal NUMERIC(8,2),
        fetched_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(coach_id, client_id, date)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nutrition_client_date
      ON client_nutrition(client_id, date);
    `);

    // Workouts - one row per session (strength/circuit/interval/video/regular)
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_workouts (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,
        name VARCHAR,
        status VARCHAR,
        type VARCHAR,
        duration_seconds INTEGER,
        trainerize_id INTEGER NOT NULL,
        detail_json JSONB,
        fetched_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(coach_id, client_id, trainerize_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workouts_client_date
      ON client_workouts(client_id, date);
    `);

    // Cardio - one row per cardio session
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_cardio (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,
        name VARCHAR,
        type VARCHAR DEFAULT 'cardio',
        duration_seconds INTEGER,
        distance NUMERIC(8,2),
        calories NUMERIC(8,2),
        max_heart_rate INTEGER,
        status VARCHAR,
        trainerize_id INTEGER NOT NULL,
        fetched_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(coach_id, client_id, trainerize_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cardio_client_date
      ON client_cardio(client_id, date);
    `);

    // Backfill progress tracking - resume capability for the backfill script
    await client.query(`
      CREATE TABLE IF NOT EXISTS backfill_progress (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        data_type VARCHAR NOT NULL,
        status VARCHAR DEFAULT 'pending',
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_message TEXT,
        rows_inserted INTEGER DEFAULT 0,
        UNIQUE(client_id, data_type)
      );
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
