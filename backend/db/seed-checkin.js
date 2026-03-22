/**
 * seed-checkin.js
 *
 * Simulates a Typeform weekly check-in webhook submission for Brendan Smartt
 * (client id 4) and then confirms the check-in was created in the database.
 *
 * Usage: node backend/db/seed-checkin.js
 *
 * Requires the backend server to be running on localhost:3001.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = require('./pool');

// Use a fixed seed token so this script is idempotent - re-running it
// will be a no-op (dedup on typeform_response_id) rather than creating
// duplicate rows.
const SEED_TOKEN = 'seed-checkin-brendan-smartt-001';

// The weekly check-in form ID (maps to 'weekly' type in FORM_TYPE_MAP)
const FORM_ID = 'n3gubYfj';

// Submitted timestamp - use now so cycle_start resolves correctly
const SUBMITTED_AT = new Date().toISOString();

// Build the Typeform webhook payload.
// Field titles must contain the right keywords so matchCategory() in overview.js
// can parse them:
//   Scores  (opinion_scale): training, nutrition, steps, sleep, digestion, stress
//   Text    (long_text):     wins/biggest win, stress source, help/support, upcoming/events
//
// The name answer must be a short_text and must be the first text answer so
// the webhook handler picks it up as the client name.
const payload = {
  form_response: {
    form_id: FORM_ID,
    token: SEED_TOKEN,
    submitted_at: SUBMITTED_AT,
    answers: [
      // --- Name (short_text) - used by webhook to fuzzy-match the client ---
      {
        type: 'text',
        text: 'Brendan Smartt',
        field: {
          id: 'field_name',
          type: 'short_text',
          title: 'Your full name',
        },
      },

      // --- Score: Training (opinion_scale 1-5) ---
      {
        type: 'number',
        number: 4,
        field: {
          id: 'field_training',
          type: 'opinion_scale',
          title: 'How would you rate your training this week?',
          properties: { steps: 5 },
        },
      },

      // --- Score: Nutrition (opinion_scale 1-5) ---
      {
        type: 'number',
        number: 3,
        field: {
          id: 'field_nutrition',
          type: 'opinion_scale',
          title: 'How would you rate your nutrition and diet adherence?',
          properties: { steps: 5 },
        },
      },

      // --- Score: Steps (opinion_scale 1-5) ---
      {
        type: 'number',
        number: 4,
        field: {
          id: 'field_steps',
          type: 'opinion_scale',
          title: 'How consistent were you with your steps and daily movement?',
          properties: { steps: 5 },
        },
      },

      // --- Score: Sleep (opinion_scale 1-5) ---
      {
        type: 'number',
        number: 3,
        field: {
          id: 'field_sleep',
          type: 'opinion_scale',
          title: 'How was your sleep quality this week?',
          properties: { steps: 5 },
        },
      },

      // --- Score: Digestion (opinion_scale 1-5) ---
      {
        type: 'number',
        number: 4,
        field: {
          id: 'field_digestion',
          type: 'opinion_scale',
          title: 'How was your digestion and gut health this week?',
          properties: { steps: 5 },
        },
      },

      // --- Score: Stress (opinion_scale 1-5, lower = more stressed) ---
      {
        type: 'number',
        number: 2,
        field: {
          id: 'field_stress',
          type: 'opinion_scale',
          title: 'How would you rate your stress and overall mood this week?',
          properties: { steps: 5 },
        },
      },

      // --- Text: Biggest wins ---
      {
        type: 'text',
        text: 'Hit all four training sessions without missing one. Also managed to meal prep on Sunday for the first time in weeks - made a big difference during the busy midweek days. Starting to feel stronger on the compound lifts.',
        field: {
          id: 'field_wins',
          type: 'long_text',
          title: 'What were your biggest wins this week?',
        },
      },

      // --- Text: Stress source ---
      {
        type: 'text',
        text: 'Work has been non-stop. A major project deadline is coming up on Friday and I have been working late most evenings. It made it harder to wind down at night and my sleep has suffered a bit as a result.',
        field: {
          id: 'field_stress_source',
          type: 'long_text',
          title: 'What has been your main stress source this week?',
        },
      },

      // --- Text: Help / support needed ---
      {
        type: 'text',
        text: 'Would love some help with quick high-protein lunch options I can prepare at the office. I keep defaulting to sandwiches when I forget to bring food from home.',
        field: {
          id: 'field_help',
          type: 'long_text',
          title: 'Where do you need the most help or support right now?',
        },
      },

      // --- Text: Upcoming events ---
      {
        type: 'text',
        text: 'Work deadline on Friday so Thursday evening training might need to shift. I also have a family dinner on Saturday night - will be eating out and having a few drinks.',
        field: {
          id: 'field_upcoming',
          type: 'long_text',
          title: 'Any upcoming events or schedule changes I should know about?',
        },
      },
    ],
  },
};

async function seedCheckin() {
  console.log('[seed-checkin] Posting simulated Typeform webhook to localhost:3001...');
  console.log(`[seed-checkin] Token: ${SEED_TOKEN}`);
  console.log(`[seed-checkin] Client name in payload: "Brendan Smartt"`);

  // POST to the webhook endpoint
  let response;
  try {
    response = await fetch('http://localhost:3001/webhooks/typeform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[seed-checkin] Failed to reach backend server. Is it running on localhost:3001?');
    console.error('[seed-checkin] Error:', err.message);
    process.exit(1);
  }

  const responseBody = await response.json();
  console.log('[seed-checkin] Webhook response:', JSON.stringify(responseBody));

  if (!responseBody.ok) {
    console.error('[seed-checkin] Webhook returned ok=false. Check the backend logs for details.');
    process.exit(1);
  }

  if (responseBody.skipped) {
    console.warn(`[seed-checkin] Webhook skipped the submission: ${responseBody.skipped}`);
    if (responseBody.skipped === 'client not matched') {
      console.warn('[seed-checkin] The name "Brendan Smartt" did not fuzzy-match any active client.');
      console.warn('[seed-checkin] Confirm that client id=4 exists in the database and is active.');
    }
    process.exit(0);
  }

  // Confirm the row was written
  console.log('[seed-checkin] Querying database to confirm check-in was created...');
  const result = await pool.query(
    `SELECT id, client_id, type, typeform_response_id, submitted_at, cycle_start
     FROM checkins
     WHERE typeform_response_id = $1`,
    [SEED_TOKEN]
  );

  if (result.rows.length === 0) {
    console.error('[seed-checkin] Check-in row not found in database. The insert may have been silently skipped.');
    process.exit(1);
  }

  const row = result.rows[0];
  console.log('[seed-checkin] Check-in confirmed in database:');
  console.log(`  id:                   ${row.id}`);
  console.log(`  client_id:            ${row.client_id}`);
  console.log(`  type:                 ${row.type}`);
  console.log(`  typeform_response_id: ${row.typeform_response_id}`);
  console.log(`  submitted_at:         ${row.submitted_at}`);
  console.log(`  cycle_start:          ${row.cycle_start}`);
  console.log('[seed-checkin] Done.');

  await pool.end();
}

seedCheckin().catch((err) => {
  console.error('[seed-checkin] Unexpected error:', err.message);
  process.exit(1);
});
