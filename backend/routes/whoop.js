/**
 * Whoop admin API - everything the coach does, behind the portal login.
 *
 * The client-facing half of the flow lives in routes/connect.js and is public
 * by necessity. Nothing in this file is.
 */

const express = require('express');
const pool = require('../db/pool');
const whoop = require('../lib/whoop');
const whoopStore = require('../lib/whoop-store');
const { mintConnectLink, LINK_TTL_DAYS } = require('./connect');

const router = express.Router();
const COACH_ID = 1;

async function getClient(id) {
  const { rows } = await pool.query(
    `SELECT id, name, health_source FROM clients WHERE id = $1 AND coach_id = $2`,
    [id, COACH_ID]
  );
  return rows[0] || null;
}

// GET /api/whoop/:id/status
router.get('/:id/status', async (req, res) => {
  try {
    const status = await whoopStore.getStatus(req.params.id);
    if (!status) return res.status(404).json({ error: 'Client not found' });
    res.json(status);
  } catch (err) {
    console.error('[Whoop/status]', err.message);
    res.status(500).json({ error: 'Could not read the Whoop connection' });
  }
});

// POST /api/whoop/:id/link - mint the link to send the client
router.post('/:id/link', async (req, res) => {
  try {
    if (!whoop.isConfigured()) {
      return res.status(400).json({
        error: 'Whoop is not set up yet. Add WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET ' +
               'and WHOOP_REDIRECT_URI in Railway, then try again.',
      });
    }
    const client = await getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const link = await mintConnectLink(client.id);
    res.json({ ...link, expiresInDays: LINK_TTL_DAYS, clientName: client.name });
  } catch (err) {
    console.error('[Whoop/link]', err.message);
    res.status(500).json({ error: 'Could not create the link' });
  }
});

// POST /api/whoop/:id/sync - pull now
router.post('/:id/sync', async (req, res) => {
  try {
    const client = await getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const days = Math.min(Math.max(parseInt(req.body?.days, 10) || 14, 1), 400);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const result = await whoopStore.sync(
      client.id, whoopStore.dublinDate(start), whoopStore.dublinDate(end)
    );
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.error('[Whoop/sync]', err.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// GET /api/whoop/:id/daily?start=&end=
router.get('/:id/daily', async (req, res) => {
  try {
    const client = await getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const end = req.query.end || whoopStore.dublinDate(new Date());
    const start = req.query.start || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return whoopStore.dublinDate(d);
    })();

    res.json({ days: await whoopStore.getDaily(client.id, start, end) });
  } catch (err) {
    console.error('[Whoop/daily]', err.message);
    res.status(500).json({ error: 'Could not read Whoop data' });
  }
});

/**
 * PUT /api/whoop/:id/source - switch a client between Trainerize and Whoop.
 *
 * Refuses to switch to Whoop without a live connection, because the result
 * would be a dashboard with no sleep data and nothing on screen explaining why.
 */
router.put('/:id/source', async (req, res) => {
  try {
    const source = req.body?.source;
    if (!['trainerize', 'whoop'].includes(source)) {
      return res.status(400).json({ error: 'source must be "trainerize" or "whoop"' });
    }
    const client = await getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (source === 'whoop') {
      const connection = await whoop.getConnection(client.id);
      if (!connection) {
        return res.status(400).json({
          error: `${client.name} has not connected their Whoop yet. Send them the link first.`,
        });
      }
    }

    await pool.query(
      `UPDATE clients SET health_source = $1 WHERE id = $2 AND coach_id = $3`,
      [source, client.id, COACH_ID]
    );
    whoopStore.forgetSource(client.id);
    res.json({ ok: true, healthSource: source });
  } catch (err) {
    console.error('[Whoop/source]', err.message);
    res.status(500).json({ error: 'Could not change the data source' });
  }
});

/**
 * DELETE /api/whoop/:id - disconnect and erase.
 *
 * A real delete, not a hide. This is the button that answers a client asking
 * for their health data to be removed, so it has to actually remove it.
 */
router.delete('/:id', async (req, res) => {
  try {
    const client = await getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    await whoop.disconnect(client.id);
    whoopStore.forgetSource(client.id);
    console.log(`[Whoop] disconnected and erased client ${client.id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Whoop/disconnect]', err.message);
    res.status(500).json({ error: 'Could not disconnect' });
  }
});

module.exports = router;
