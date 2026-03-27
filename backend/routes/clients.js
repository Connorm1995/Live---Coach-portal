const express = require('express');
const pool = require('../db/pool');
const { trainerizePost: tzPost } = require('../lib/trainerize');

const router = express.Router();

const COACH_ID = 1; // Single coach for now

async function trainerizeGetClientSummary(trainerizeId) {
  const result = await tzPost('/user/getClientSummary', { userID: Number(trainerizeId) }, { label: 'Clients' });
  return result.data;
}

// GET /api/clients — list all clients for this coach
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, program, trainerize_id, pending_setup, active, current_phase, mfp_url, reminders_enabled, created_at
       FROM clients
       WHERE coach_id = $1
       ORDER BY pending_setup DESC, active DESC, name ASC`,
      [COACH_ID]
    );
    res.json({ clients: result.rows });
  } catch (err) {
    console.error('[Clients] Error fetching clients:', err.message);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/:id/detail — full client detail for header display
router.get('/:id/detail', async (req, res) => {
  const { id } = req.params;

  try {
    // Client data + last check-in date in one query
    const result = await pool.query(`
      SELECT
        cl.id, cl.name, cl.email, cl.program, cl.trainerize_id,
        cl.current_phase, cl.mfp_url, cl.objectives, cl.created_at, cl.trainerize_joined_at,
        (SELECT MAX(c.submitted_at) FROM checkins c WHERE c.client_id = cl.id) AS last_checkin_at
      FROM clients cl
      WHERE cl.id = $1 AND cl.coach_id = $2
    `, [id, COACH_ID]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = result.rows[0];

    // Fetch session count from Trainerize
    let sessionCount = null;
    if (client.trainerize_id) {
      try {
        const summary = await trainerizeGetClientSummary(client.trainerize_id);
        if (summary && summary.workoutsTotal != null) {
          sessionCount = summary.workoutsTotal;
        }
      } catch (err) {
        console.error(`[Clients] Failed to fetch session count for ${client.name}: ${err.message}`);
      }
    }

    res.json({
      client: {
        id: client.id,
        name: client.name,
        program: client.program,
        currentPhase: client.current_phase,
        mfpUrl: client.mfp_url,
        objectives: client.objectives,
        joinedAt: client.trainerize_joined_at || client.created_at,
        lastCheckinAt: client.last_checkin_at,
        sessionCount,
      },
    });
  } catch (err) {
    console.error('[Clients] Error fetching client detail:', err.message);
    res.status(500).json({ error: 'Failed to fetch client detail' });
  }
});

// POST /api/clients — create a new client
router.post('/', async (req, res) => {
  try {
    const { name, program, trainerize_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const validPrograms = ['my_fit_coach', 'my_fit_coach_core'];
    if (!program || !validPrograms.includes(program)) {
      return res.status(400).json({ error: 'Program must be my_fit_coach or my_fit_coach_core' });
    }

    const result = await pool.query(
      `INSERT INTO clients (coach_id, name, program, trainerize_id, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, program, trainerize_id, active, created_at`,
      [COACH_ID, name.trim(), program, trainerize_id?.trim() || null]
    );

    res.status(201).json({ client: result.rows[0] });
  } catch (err) {
    console.error('[Clients] Error creating client:', err.message);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id — update a client
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, program, trainerize_id, current_phase, mfp_url, objectives } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const validPrograms = ['my_fit_coach', 'my_fit_coach_core'];
    if (program && !validPrograms.includes(program)) {
      return res.status(400).json({ error: 'Program must be my_fit_coach or my_fit_coach_core' });
    }

    const validPhases = ['recomp', 'fat_loss', 'building', 'maintenance'];
    if (current_phase && !validPhases.includes(current_phase)) {
      return res.status(400).json({ error: 'Phase must be recomp, fat_loss, building, or maintenance' });
    }

    const result = await pool.query(
      `UPDATE clients
       SET name = $1, program = $2, trainerize_id = $3, current_phase = $4, mfp_url = $8, objectives = $9,
           pending_setup = CASE WHEN $7 THEN false ELSE pending_setup END
       WHERE id = $5 AND coach_id = $6
       RETURNING id, name, email, program, trainerize_id, pending_setup, active, current_phase, mfp_url, objectives, created_at`,
      [name.trim(), program || null, trainerize_id?.trim() || null, current_phase || null, id, COACH_ID, !!program, mfp_url?.trim() || null, objectives != null ? objectives : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: result.rows[0] });
  } catch (err) {
    console.error('[Clients] Error updating client:', err.message);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// PATCH /api/clients/:id/phase — update training phase only
router.patch('/:id/phase', async (req, res) => {
  try {
    const { id } = req.params;
    const { current_phase } = req.body;
    const validPhases = ['recomp', 'fat_loss', 'building', 'maintenance'];
    if (current_phase != null && current_phase !== '' && !validPhases.includes(current_phase)) {
      return res.status(400).json({ error: 'Invalid phase' });
    }
    const result = await pool.query(
      `UPDATE clients SET current_phase = $1
       WHERE id = $2 AND coach_id = $3
       RETURNING id, current_phase`,
      [current_phase || null, id, COACH_ID]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ current_phase: result.rows[0].current_phase });
  } catch (err) {
    console.error('[Clients] Error updating phase:', err.message);
    res.status(500).json({ error: 'Failed to update phase' });
  }
});

// PATCH /api/clients/:id/deactivate
router.patch('/:id/deactivate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE clients SET active = false
       WHERE id = $1 AND coach_id = $2
       RETURNING id, name, program, trainerize_id, active, created_at`,
      [id, COACH_ID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: result.rows[0] });
  } catch (err) {
    console.error('[Clients] Error deactivating client:', err.message);
    res.status(500).json({ error: 'Failed to deactivate client' });
  }
});

// PATCH /api/clients/:id/activate
router.patch('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE clients SET active = true
       WHERE id = $1 AND coach_id = $2
       RETURNING id, name, program, trainerize_id, active, created_at`,
      [id, COACH_ID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: result.rows[0] });
  } catch (err) {
    console.error('[Clients] Error activating client:', err.message);
    res.status(500).json({ error: 'Failed to activate client' });
  }
});

// PATCH /api/clients/:id/toggle-reminders
router.patch('/:id/toggle-reminders', async (req, res) => {
  try {
    const { id } = req.params;
    const { remindersEnabled } = req.body;

    if (typeof remindersEnabled !== 'boolean') {
      return res.status(400).json({ error: 'remindersEnabled must be a boolean' });
    }

    const result = await pool.query(
      `UPDATE clients SET reminders_enabled = $1
       WHERE id = $2 AND coach_id = $3
       RETURNING id, reminders_enabled`,
      [remindersEnabled, id, COACH_ID]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: result.rows[0] });
  } catch (err) {
    console.error('[Clients] Error toggling reminders:', err.message);
    res.status(500).json({ error: 'Failed to toggle reminders' });
  }
});

// POST /api/clients/:id/prefetch - warm the cache for a client's Overview tab data
// Called in the background when a client is selected from the Check-in Hub
router.post('/:id/prefetch', async (req, res) => {
  const { id } = req.params;
  try {
    const clientResult = await pool.query(
      `SELECT trainerize_id FROM clients WHERE id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    if (clientResult.rows.length === 0) return res.json({ ok: true });
    const tid = clientResult.rows[0].trainerize_id;
    if (!tid) return res.json({ ok: true });

    // Calculate date ranges (same as overview.js)
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dow = today.getUTCDay();
    const daysSinceMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(today);
    thisMonday.setUTCDate(today.getUTCDate() - daysSinceMonday);
    const prevMonday = new Date(thisMonday);
    prevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
    const prevWeekStart = prevMonday.toISOString().split('T')[0];
    const prevWeekEnd = prevSunday.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    const tenDaysAgo = new Date(yesterday);
    tenDaysAgo.setUTCDate(yesterday.getUTCDate() - 9);
    const last10Start = tenDaysAgo.toISOString().split('T')[0];
    const last10End = yesterday.toISOString().split('T')[0];

    // Fire all Trainerize calls in parallel (just to warm cache, discard results)
    Promise.all([
      tzPost('/calendar/getList', { userID: Number(tid), startDate: prevWeekStart, endDate: prevWeekEnd, unitWeight: 'kg' }, { label: 'Prefetch' }),
      tzPost('/dailyNutrition/getList', { userID: Number(tid), startDate: prevWeekStart, endDate: prevWeekEnd }, { label: 'Prefetch' }),
      tzPost('/healthData/getList', { userID: Number(tid), type: 'step', startDate: last10Start, endDate: last10End }, { label: 'Prefetch' }),
      tzPost('/healthData/getListSleep', { userID: Number(tid), startTime: last10Start + ' 00:00:00', endTime: last10End + ' 23:59:59' }, { label: 'Prefetch' }),
      tzPost('/healthData/getList', { userID: Number(tid), type: 'restingHeartRate', startDate: last10Start, endDate: last10End }, { label: 'Prefetch' }),
    ]).then(() => {
      console.log(`[Prefetch] Cache warmed for client ${id} (tid=${tid})`);
    }).catch(err => {
      console.warn(`[Prefetch] Error warming cache for client ${id}:`, err.message);
    });

    // Return immediately - don't wait for prefetch to complete
    res.json({ ok: true });
  } catch (err) {
    console.error('[Prefetch] Error:', err.message);
    res.json({ ok: true }); // never fail the client selection
  }
});

module.exports = router;
