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

    // Add timezone column to clients (for per-client reminder scheduling)
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS timezone VARCHAR NOT NULL DEFAULT 'Europe/Dublin'
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

    // Calendar coverage - one row per day that has actually been fetched from
    // calendar/getList. Without this the store cannot tell "no sessions that
    // day" apart from "never asked Trainerize about that day", so a narrow
    // fetch (the 3 week session calendar) made wider ranges (a training plan)
    // look fully cached and their sessions never appeared.
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_calendar_coverage (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, client_id, date)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_coverage_client_date
      ON client_calendar_coverage(client_id, date);
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

    // Trainerize auto messages (dailyMessage/*) run log.
    //
    // Auto messages live entirely inside Trainerize and CANNOT be listed back
    // through the API - there is no dailyMessage/getList and calendar/getList
    // omits them (see docs/logic.md). This table is therefore the only record
    // that a message exists. It is the recovery mechanism, in the same spirit
    // as soft delete on scheduled posts, and it lives in the database rather
    // than a JSON file precisely so it cannot be lost with a laptop or a
    // cleared temp directory.
    await client.query(`
      CREATE TABLE IF NOT EXISTS auto_messages (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        trainerize_user_id BIGINT NOT NULL,
        trainerize_message_id BIGINT NOT NULL UNIQUE,
        kind VARCHAR NOT NULL CHECK (kind IN ('weekly', 'eom')),
        send_date DATE NOT NULL,
        send_time_minutes INTEGER NOT NULL,
        title VARCHAR NOT NULL,
        batch_id VARCHAR NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);

    // "What does this client still have scheduled?" - the query the runway
    // top-up and the idempotency check both run.
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_messages_live
      ON auto_messages (coach_id, client_id, kind, deleted_at, send_date);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_messages_batch
      ON auto_messages (batch_id);
    `);

    // ---- Session revocation (Aug 2026) ----
    //
    // One row per application ('portal', 'forms'). Every session token carries
    // the epoch it was signed with, so incrementing this value invalidates every
    // token ever issued for that app - the "log out everywhere" kill switch.
    //
    // Created identically by forms/db/migrate.js. Both apps share one database
    // but no code, so whichever migration runs first wins and the other is a
    // no-op. Keep the two definitions the same.
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_epochs (
        coach_id INTEGER NOT NULL,
        app VARCHAR NOT NULL,
        epoch INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (coach_id, app)
      );
    `);

    // How an exercise is loaded, so progress can be read on one scale.
    //
    // This is set by the coach, never inferred. On an assisted pull-up the
    // logged weight is the ASSISTANCE, so the load is bodyweight minus that
    // number; on a weighted pull-up the same field is added load. Guessing
    // between the two from the exercise name would invert the progress signal
    // on the movements it matters most for, so an unset exercise stays
    // unresolved rather than being assumed.
    await client.query(`
      CREATE TABLE IF NOT EXISTS exercise_load_modes (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        exercise_name VARCHAR NOT NULL,
        mode VARCHAR NOT NULL,
        note TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, exercise_name)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exercise_load_modes_coach
      ON exercise_load_modes(coach_id);
    `);

    // -----------------------------------------------------------------------
    // Whoop
    // -----------------------------------------------------------------------
    // Whoop data deliberately lives in its own tables rather than being mixed
    // into client_sleep / client_health_data alongside Trainerize.
    //
    // Those two tables key on (client, date, type) with no notion of where a
    // row came from, so writing Whoop rows into them would either collide with
    // the Trainerize row for the same night or force the unique constraints to
    // be rebuilt underneath live data. Keeping Whoop separate means the switch
    // is reversible: flip clients.health_source back and the original
    // Trainerize rows are still sitting there untouched.
    //
    // The join happens in lib/trainerize-store.js, which serves a Whoop client
    // out of these tables in the exact shape the routes already expect.

    // Which source feeds a client's sleep, resting HR and calories. Everything
    // else (steps, nutrition, weight, programmed workouts) always comes from
    // Trainerize - Whoop's API has no equivalent.
    await client.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS health_source VARCHAR
      NOT NULL DEFAULT 'trainerize'
      CHECK (health_source IN ('trainerize', 'whoop'))
    `);

    // One row per connected client. Tokens are encrypted at rest because the
    // nightly R2 backup would otherwise carry live health-data credentials in
    // plain text - see lib/whoop.js.
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_whoop_connections (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        whoop_user_id BIGINT,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMPTZ,
        scopes TEXT,
        connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ,
        backfill_done BOOLEAN NOT NULL DEFAULT false,
        last_sync_at TIMESTAMPTZ,
        last_sync_error TEXT,
        UNIQUE(coach_id, client_id)
      );
    `);

    // The personal link the coach sends a client. Short-lived on purpose: a
    // link that never expires is a permanent handle on someone's health data
    // sitting in a WhatsApp thread.
    await client.query(`
      CREATE TABLE IF NOT EXISTS whoop_connect_links (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        token VARCHAR NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_whoop_links_token ON whoop_connect_links(token);
    `);

    // One row per client per day. `date` is the Europe/Dublin date of the
    // MORNING the client woke, which is how Whoop's own app files a night's
    // sleep - so the number here matches the number on his phone.
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_whoop_daily (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,

        recovery_score NUMERIC(5,2),
        hrv_ms NUMERIC(6,2),
        resting_hr INTEGER,
        spo2_percent NUMERIC(5,2),
        skin_temp_c NUMERIC(5,2),
        recovery_calibrating BOOLEAN NOT NULL DEFAULT false,

        day_strain NUMERIC(5,2),
        calories_kcal INTEGER,
        avg_hr INTEGER,
        max_hr INTEGER,

        -- Two different days, and both are needed.
        --
        -- "date" above is the morning the client WOKE, which is how Whoop files
        -- a cycle: the recovery, HRV and strain on this row all belong to that
        -- day, and reading them here matches what he sees in his own app.
        --
        -- "sleep_night_date" is the evening he went to BED, which is how the
        -- portal has always filed sleep (see parseSleepData in
        -- routes/client-overview.js). The sleep tile and the calendar are keyed
        -- that way for every other client, so Whoop sleep has to be too or his
        -- dashboard would disagree with itself.
        --
        -- Normally sleep_night_date = date - 1. It is stored rather than
        -- derived because that is not guaranteed: a nap-only day, or a night
        -- that runs past noon, breaks the assumption.
        sleep_night_date DATE,
        sleep_start TIMESTAMPTZ,
        sleep_end TIMESTAMPTZ,
        sleep_seconds INTEGER,
        sleep_needed_seconds INTEGER,
        sleep_performance NUMERIC(5,2),
        sleep_consistency NUMERIC(5,2),
        sleep_efficiency NUMERIC(5,2),
        rem_seconds INTEGER,
        deep_seconds INTEGER,
        light_seconds INTEGER,
        awake_seconds INTEGER,
        sleep_cycles INTEGER,
        disturbances INTEGER,
        respiratory_rate NUMERIC(5,2),
        nap_seconds INTEGER,

        -- The client's OWN UTC offset for that night, as Whoop reports it
        -- (e.g. "+10:00"). Sleep is a local-time idea: which night it belongs
        -- to has to be decided where the client actually is, not where the
        -- coach is. Cian is in Australia, and bucketing his nights by Dublin
        -- noon would have started shifting them a day on 25 Oct 2026 when
        -- Ireland leaves summer time.
        timezone_offset VARCHAR,

        cycle_id BIGINT,
        sleep_uuid VARCHAR,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, client_id, date)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_whoop_daily_client_date
      ON client_whoop_daily(client_id, date);
    `);
    await client.query(`
      ALTER TABLE client_whoop_daily ADD COLUMN IF NOT EXISTS timezone_offset VARCHAR
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_whoop_daily_client_night
      ON client_whoop_daily(client_id, sleep_night_date);
    `);

    // Whoop's auto-detected sessions. Kept apart from client_workouts and
    // client_cardio on purpose: those hold what the coach PRESCRIBED, this
    // holds what the client's heart actually did. Merging them would double up
    // every session, because Whoop already feeds Apple Health, which feeds
    // Trainerize.
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_whoop_workouts (
        id SERIAL PRIMARY KEY,
        coach_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date DATE NOT NULL,
        whoop_id VARCHAR NOT NULL,
        sport VARCHAR,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        duration_seconds INTEGER,
        strain NUMERIC(5,2),
        avg_hr INTEGER,
        max_hr INTEGER,
        calories_kcal INTEGER,
        distance_m NUMERIC(10,2),
        zone_json JSONB,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(coach_id, client_id, whoop_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_whoop_workouts_client_date
      ON client_whoop_workouts(client_id, date);
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
