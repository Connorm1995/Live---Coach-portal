const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const COACH_ID = 1; // Single coach for now

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT reminders_enabled, mfc_reminders_enabled, core_reminders_enabled
       FROM coach_settings WHERE coach_id = $1`,
      [COACH_ID]
    );

    if (result.rows.length === 0) {
      return res.json({
        remindersEnabled: true,
        mfcRemindersEnabled: true,
        coreRemindersEnabled: true,
      });
    }

    const row = result.rows[0];
    res.json({
      remindersEnabled: row.reminders_enabled,
      mfcRemindersEnabled: row.mfc_reminders_enabled,
      coreRemindersEnabled: row.core_reminders_enabled,
    });
  } catch (err) {
    console.error('Error fetching settings:', err.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  const { remindersEnabled, mfcRemindersEnabled, coreRemindersEnabled } = req.body;

  // Build dynamic update fields
  const updates = [];
  const values = [COACH_ID];
  let idx = 2;

  if (typeof remindersEnabled === 'boolean') {
    updates.push(`reminders_enabled = $${idx++}`);
    values.push(remindersEnabled);
  }
  if (typeof mfcRemindersEnabled === 'boolean') {
    updates.push(`mfc_reminders_enabled = $${idx++}`);
    values.push(mfcRemindersEnabled);
  }
  if (typeof coreRemindersEnabled === 'boolean') {
    updates.push(`core_reminders_enabled = $${idx++}`);
    values.push(coreRemindersEnabled);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'At least one setting must be provided' });
  }

  try {
    await pool.query(
      `INSERT INTO coach_settings (coach_id, reminders_enabled, mfc_reminders_enabled, core_reminders_enabled)
       VALUES ($1, true, true, true)
       ON CONFLICT (coach_id) DO UPDATE
       SET ${updates.join(', ')}, updated_at = now()`,
      values
    );

    // Re-fetch to return current state
    const result = await pool.query(
      `SELECT reminders_enabled, mfc_reminders_enabled, core_reminders_enabled
       FROM coach_settings WHERE coach_id = $1`,
      [COACH_ID]
    );

    const row = result.rows[0];
    res.json({
      remindersEnabled: row.reminders_enabled,
      mfcRemindersEnabled: row.mfc_reminders_enabled,
      coreRemindersEnabled: row.core_reminders_enabled,
    });
  } catch (err) {
    console.error('Error updating settings:', err.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
