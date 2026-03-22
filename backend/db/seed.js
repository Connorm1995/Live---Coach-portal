const pool = require('./pool');
const { getCurrentCycleSunday, getCurrentMonthFirst } = require('../lib/cycle');

const COACH_ID = 1;

const testClients = [
  { trainerize_id: '5346208', name: 'Brendan Smart', program: 'my_fit_coach' },
  { name: 'Sarah Murphy', program: 'my_fit_coach_core' },
  { name: 'James O\'Brien', program: 'my_fit_coach' },
  { name: 'Aoife Kelly', program: 'my_fit_coach' },
  { name: 'Ciara Doyle', program: 'my_fit_coach_core' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing seed data
    await client.query('DELETE FROM checkins');
    await client.query('DELETE FROM clients');

    // Insert clients
    const clientIds = {};
    for (const c of testClients) {
      const res = await client.query(
        `INSERT INTO clients (coach_id, trainerize_id, name, program)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [COACH_ID, c.trainerize_id || null, c.name, c.program]
      );
      clientIds[c.name] = res.rows[0].id;
    }

    const weekStart = getCurrentCycleSunday();
    const monthStart = getCurrentMonthFirst();

    // Brendan: submitted weekly check-in, not yet responded (pending)
    await client.query(
      `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, cycle_start)
       VALUES ($1, $2, 'weekly', 'tf_seed_001', now() - interval '1 day', false, $3)`,
      [COACH_ID, clientIds['Brendan Smart'], weekStart]
    );

    // Sarah: submitted EOM report, already responded (done)
    await client.query(
      `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, responded_at, cycle_start)
       VALUES ($1, $2, 'eom_report', 'tf_seed_002', now() - interval '2 days', true, now() - interval '1 day', $3)`,
      [COACH_ID, clientIds['Sarah Murphy'], monthStart]
    );

    // James: submitted weekly check-in, already responded (done)
    await client.query(
      `INSERT INTO checkins (coach_id, client_id, type, typeform_response_id, submitted_at, responded, responded_at, cycle_start)
       VALUES ($1, $2, 'weekly', 'tf_seed_003', now() - interval '3 days', true, now() - interval '2 days', $3)`,
      [COACH_ID, clientIds['James O\'Brien'], weekStart]
    );

    // Aoife: no check-in submitted (not submitted)
    // Ciara: no EOM report submitted (not submitted)

    await client.query('COMMIT');
    console.log('Seed complete — 5 clients, 3 check-ins inserted.');
    console.log('  Pending: Brendan Smart (weekly)');
    console.log('  Done: Sarah Murphy (eom_report), James O\'Brien (weekly)');
    console.log('  Not Submitted: Aoife Kelly, Ciara Doyle');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
