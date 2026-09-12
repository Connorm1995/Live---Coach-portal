const express = require('express');
const pool = require('../db/pool');

const router = express.Router();
const COACH_ID = 1;

// PUT /api/overview/:id/focus - Save/update focus
router.put('/:id/focus', async (req, res) => {
  const { id } = req.params;
  const { text, weekStart } = req.body;

  if (text == null || !weekStart) {
    return res.status(400).json({ error: 'text and weekStart are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO weekly_focus (coach_id, client_id, week_start, focus_text, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (coach_id, client_id, week_start)
       DO UPDATE SET focus_text = $4, updated_at = now()
       RETURNING id, week_start, focus_text`,
      [COACH_ID, id, weekStart, text]
    );
    res.json({ focus: result.rows[0] });
  } catch (err) {
    console.error('[Focus] Error:', err.message);
    res.status(500).json({ error: 'Failed to save focus' });
  }
});

// PUT /api/overview/:id/settings - Update client settings
router.put('/:id/settings', async (req, res) => {
  const { id } = req.params;
  const { stepTarget, phaseRateMin, phaseRateMax, phaseStartDate, phaseStartWeight, fibreTarget } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO client_settings (coach_id, client_id, step_target, phase_rate_min, phase_rate_max, phase_start_date, phase_start_weight, fibre_target, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (coach_id, client_id)
       DO UPDATE SET
         step_target = COALESCE($3, client_settings.step_target),
         phase_rate_min = COALESCE($4, client_settings.phase_rate_min),
         phase_rate_max = COALESCE($5, client_settings.phase_rate_max),
         phase_start_date = COALESCE($6, client_settings.phase_start_date),
         phase_start_weight = COALESCE($7, client_settings.phase_start_weight),
         fibre_target = COALESCE($8, client_settings.fibre_target),
         updated_at = now()
       RETURNING *`,
      [COACH_ID, id, stepTarget, phaseRateMin, phaseRateMax, phaseStartDate, phaseStartWeight, fibreTarget]
    );
    res.json({ settings: result.rows[0] });
  } catch (err) {
    console.error('[Settings] Error:', err.message);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// GET /api/overview/:id/trajectory-settings
router.get('/:id/trajectory-settings', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM weight_trajectory_settings WHERE client_id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    const row = result.rows[0];
    if (!row) return res.json({ trajectorySettings: null });

    res.json({
      trajectorySettings: {
        phaseType: row.phase_type,
        startDate: row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : row.start_date,
        endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : row.end_date) : null,
        minRate: row.min_rate != null ? Number(row.min_rate) : null,
        maxRate: row.max_rate != null ? Number(row.max_rate) : null,
        lowerBand: row.lower_band != null ? Number(row.lower_band) : null,
        upperBand: row.upper_band != null ? Number(row.upper_band) : null,
      },
    });
  } catch (err) {
    console.error('[TrajectorySettings] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trajectory settings' });
  }
});

// PUT /api/overview/:id/trajectory-settings
router.put('/:id/trajectory-settings', async (req, res) => {
  const { id } = req.params;
  const { phaseType, startDate, endDate, minRate, maxRate, lowerBand, upperBand } = req.body;

  const validPhases = ['fat_loss', 'building', 'recomp', 'maintenance'];
  if (!validPhases.includes(phaseType)) {
    return res.status(400).json({ error: 'Invalid phase type' });
  }
  if (!startDate) {
    return res.status(400).json({ error: 'Start date is required' });
  }

  const isRate = phaseType === 'fat_loss' || phaseType === 'building';
  const finalMinRate = isRate ? minRate : null;
  const finalMaxRate = isRate ? maxRate : null;
  const finalLowerBand = isRate ? null : lowerBand;
  const finalUpperBand = isRate ? null : upperBand;

  try {
    const result = await pool.query(
      `INSERT INTO weight_trajectory_settings (coach_id, client_id, phase_type, start_date, end_date, min_rate, max_rate, lower_band, upper_band, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (coach_id, client_id)
       DO UPDATE SET
         phase_type = $3,
         start_date = $4,
         end_date = $5,
         min_rate = $6,
         max_rate = $7,
         lower_band = $8,
         upper_band = $9,
         updated_at = now()
       RETURNING *`,
      [COACH_ID, id, phaseType, startDate, endDate || null, finalMinRate, finalMaxRate, finalLowerBand, finalUpperBand]
    );
    const row = result.rows[0];
    res.json({
      trajectorySettings: {
        phaseType: row.phase_type,
        startDate: row.start_date instanceof Date ? row.start_date.toISOString().split('T')[0] : row.start_date,
        endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split('T')[0] : row.end_date) : null,
        minRate: row.min_rate != null ? Number(row.min_rate) : null,
        maxRate: row.max_rate != null ? Number(row.max_rate) : null,
        lowerBand: row.lower_band != null ? Number(row.lower_band) : null,
        upperBand: row.upper_band != null ? Number(row.upper_band) : null,
      },
    });
  } catch (err) {
    console.error('[TrajectorySettings] PUT error:', err.message);
    res.status(500).json({ error: 'Failed to save trajectory settings' });
  }
});

// DELETE /api/overview/:id/trajectory-settings
router.delete('/:id/trajectory-settings', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `DELETE FROM weight_trajectory_settings WHERE client_id = $1 AND coach_id = $2`,
      [id, COACH_ID]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[TrajectorySettings] DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to clear trajectory settings' });
  }
});

module.exports = router;
