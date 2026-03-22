const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const COACH_ID = 1; // Single coach for now

// --- Trainerize API helper ---
const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const TRAINERIZE_AUTH = 'Basic ' + Buffer.from(
  `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
).toString('base64');

async function trainerizeGetClientSummary(trainerizeId) {
  const res = await fetch(`${TRAINERIZE_API}/user/getClientSummary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
    body: JSON.stringify({ userID: Number(trainerizeId) }),
  });

  if (!res.ok) return null;
  return res.json();
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
        cl.current_phase, cl.mfp_url, cl.created_at, cl.trainerize_joined_at,
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
    const { name, program, trainerize_id, current_phase, mfp_url } = req.body;

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
       SET name = $1, program = $2, trainerize_id = $3, current_phase = $4, mfp_url = $8,
           pending_setup = CASE WHEN $7 THEN false ELSE pending_setup END
       WHERE id = $5 AND coach_id = $6
       RETURNING id, name, email, program, trainerize_id, pending_setup, active, current_phase, mfp_url, created_at`,
      [name.trim(), program || null, trainerize_id?.trim() || null, current_phase || null, id, COACH_ID, !!program, mfp_url?.trim() || null]
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

module.exports = router;
