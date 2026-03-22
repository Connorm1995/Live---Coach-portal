const express = require('express');
const pool = require('../db/pool');

const { getCurrentCycleSunday, getCurrentMonthFirst, isCycleClosed } = require('../lib/cycle');

const router = express.Router();

const COACH_ID = 1; // Single coach for now

// --- Trainerize API helper ---
const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const TRAINERIZE_AUTH = 'Basic ' + Buffer.from(
  `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
).toString('base64');

async function trainerizeSendDM(recipientTrainerizeId, messageText) {
  const res = await fetch(`${TRAINERIZE_API}/message/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
    body: JSON.stringify({
      recipients: [Number(recipientTrainerizeId)],
      subject: 'Check-in Feedback',
      body: messageText,
      conversationType: 'single',
      type: 'text',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trainerize message/send responded ${res.status}: ${text}`);
  }

  return res.json();
}

// GET /api/checkins/hub?filter=all|weekly|eom
router.get('/hub', async (req, res) => {
  const filter = req.query.filter || 'all';
  const weekStart = getCurrentCycleSunday();
  const monthStart = getCurrentMonthFirst();
  const cycleClosed = isCycleClosed();

  try {
    // Build type filter clause
    let typeFilter = '';
    const params = [COACH_ID, weekStart, monthStart];

    if (filter === 'weekly') {
      typeFilter = `AND c.type = 'weekly'`;
    } else if (filter === 'eom') {
      typeFilter = `AND c.type = 'eom_report'`;
    }

    // Get all check-ins for current cycles
    const checkinsResult = await pool.query(`
      SELECT
        c.id AS checkin_id,
        c.client_id,
        cl.name,
        cl.program,
        c.type,
        c.submitted_at,
        c.responded,
        c.responded_at
      FROM checkins c
      JOIN clients cl ON cl.id = c.client_id
      WHERE c.coach_id = $1
        AND cl.active = true
        AND (
          (c.type = 'weekly' AND c.cycle_start = $2)
          OR (c.type = 'eom_report' AND c.cycle_start = $3)
        )
        ${typeFilter}
      ORDER BY c.submitted_at DESC
    `, params);

    const pending = [];
    const done = [];
    const submittedClientIds = new Set();

    for (const row of checkinsResult.rows) {
      submittedClientIds.add(row.client_id);
      const entry = {
        checkinId: row.checkin_id,
        clientId: row.client_id,
        name: row.name,
        program: row.program,
        type: row.type,
        submittedAt: row.submitted_at,
      };
      if (row.responded) {
        entry.respondedAt = row.responded_at;
        done.push(entry);
      } else {
        pending.push(entry);
      }
    }

    // Get active clients who haven't submitted for their current cycle
    let notSubmittedFilter = '';
    if (filter === 'weekly') {
      notSubmittedFilter = `AND cl.program = 'my_fit_coach'`;
    } else if (filter === 'eom') {
      notSubmittedFilter = `AND cl.program = 'my_fit_coach_core'`;
    }

    const clientsResult = await pool.query(`
      SELECT cl.id AS client_id, cl.name, cl.program
      FROM clients cl
      WHERE cl.coach_id = $1
        AND cl.active = true
        ${notSubmittedFilter}
      ORDER BY cl.name
    `, [COACH_ID]);

    const notSubmitted = clientsResult.rows
      .filter(cl => !submittedClientIds.has(cl.client_id))
      .map(cl => ({
        clientId: cl.client_id,
        name: cl.name,
        program: cl.program,
      }));

    res.json({ pending, done, notSubmitted, cycleClosed, cycleStart: weekStart });
  } catch (err) {
    console.error('Error fetching check-in hub:', err.message);
    res.status(500).json({ error: 'Failed to load check-in hub' });
  }
});

// GET /api/checkins/pending/:clientId — get the most recent pending check-in for a client in the current cycle
router.get('/pending/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const weekStart = getCurrentCycleSunday();
  const monthStart = getCurrentMonthFirst();

  try {
    const result = await pool.query(`
      SELECT c.id AS checkin_id, c.type, c.submitted_at, cl.name, cl.trainerize_id
      FROM checkins c
      JOIN clients cl ON cl.id = c.client_id
      WHERE c.coach_id = $1
        AND c.client_id = $2
        AND c.responded = false
        AND (
          (c.type = 'weekly' AND c.cycle_start = $3)
          OR (c.type = 'eom_report' AND c.cycle_start = $4)
        )
      ORDER BY c.submitted_at DESC
      LIMIT 1
    `, [COACH_ID, clientId, weekStart, monthStart]);

    if (result.rows.length === 0) {
      return res.json({ pending: null });
    }

    const row = result.rows[0];
    res.json({
      pending: {
        checkinId: row.checkin_id,
        type: row.type,
        submittedAt: row.submitted_at,
        clientName: row.name,
        trainerizeId: row.trainerize_id,
      },
    });
  } catch (err) {
    console.error('Error fetching pending check-in:', err.message);
    res.status(500).json({ error: 'Failed to fetch pending check-in' });
  }
});

// POST /api/checkins/:id/send-loom — send Loom feedback + mark as responded
router.post('/:id/send-loom', async (req, res) => {
  const { id } = req.params;
  const { loomUrl, message } = req.body;

  if (!loomUrl || !message) {
    return res.status(400).json({ error: 'loomUrl and message are required' });
  }

  try {
    // 1. Look up the check-in + client details
    const checkinResult = await pool.query(`
      SELECT c.id, c.client_id, c.responded, cl.name, cl.trainerize_id
      FROM checkins c
      JOIN clients cl ON cl.id = c.client_id
      WHERE c.id = $1 AND c.coach_id = $2
    `, [id, COACH_ID]);

    if (checkinResult.rows.length === 0) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    const checkin = checkinResult.rows[0];

    if (checkin.responded) {
      return res.status(409).json({ error: 'Already responded to this check-in' });
    }

    // 2. Send DM via Trainerize
    let trainerizeDmSent = false;
    if (checkin.trainerize_id) {
      try {
        await trainerizeSendDM(checkin.trainerize_id, message);
        trainerizeDmSent = true;
        console.log(`[Loom send] DM sent to "${checkin.name}" (trainerize_id: ${checkin.trainerize_id})`);
      } catch (dmErr) {
        console.error(`[Loom send] Failed to DM "${checkin.name}": ${dmErr.message}`);
        // Still mark as responded even if DM fails - Connor can resend manually
      }
    } else {
      console.warn(`[Loom send] No trainerize_id for "${checkin.name}" - skipping DM`);
    }

    // 3. Mark as responded
    const updateResult = await pool.query(`
      UPDATE checkins
      SET responded = true, responded_at = now()
      WHERE id = $1 AND responded = false
      RETURNING id, client_id, responded, responded_at
    `, [id]);

    if (updateResult.rows.length === 0) {
      return res.status(409).json({ error: 'Already responded (race condition)' });
    }

    res.json({
      success: true,
      checkin: updateResult.rows[0],
      trainerizeDmSent,
    });
  } catch (err) {
    console.error('Error sending Loom feedback:', err.message);
    res.status(500).json({ error: 'Failed to send Loom feedback' });
  }
});

// PATCH /api/checkins/:id/respond
router.patch('/:id/respond', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      UPDATE checkins
      SET responded = true, responded_at = now()
      WHERE id = $1 AND coach_id = $2 AND responded = false
      RETURNING id, client_id, responded, responded_at
    `, [id, COACH_ID]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Check-in not found or already responded' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error marking check-in as responded:', err.message);
    res.status(500).json({ error: 'Failed to update check-in' });
  }
});

module.exports = router;
