/**
 * trajectory.js
 *
 * Weight trajectory band maths, shared by the Overview chart and Check-in Mode.
 * Extracted so the two views can never drift apart on how a band is drawn.
 */

export const PHASE_LABELS = {
  fat_loss: 'Fat Loss',
  building: 'Building',
  recomp: 'Recomp',
  maintenance: 'Maintenance',
};

export const PHASE_COLORS = {
  fat_loss:    { stroke: 'var(--color-red)',   fill: 'rgba(239, 68, 68, 0.12)' },
  building:    { stroke: 'var(--color-green)', fill: 'rgba(34, 197, 94, 0.12)' },
  recomp:      { stroke: 'var(--color-teal)',  fill: 'rgba(35, 184, 184, 0.12)' },
  maintenance: { stroke: 'var(--color-teal)',  fill: 'rgba(35, 184, 184, 0.12)' },
};

function fmtShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// A rate phase grows its band week by week from the start weight. A band phase
// is a flat window between two fixed weights.
function isRatePhase(phaseType) {
  return phaseType === 'fat_loss' || phaseType === 'building';
}

/**
 * Build the chart series plus everything needed to render the overlay.
 * Returns { chartData, hasBand, yDomain, colors, legendText }.
 */
export function buildTrajectoryChart(entries, trajectory) {
  let chartData = entries || [];
  let hasBand = false;
  const colors = trajectory ? PHASE_COLORS[trajectory.phaseType] : null;

  if (trajectory && entries && entries.length > 0) {
    const rate = isRatePhase(trajectory.phaseType);

    if (rate && trajectory.minRate != null && trajectory.maxRate != null) {
      const startEntry = entries.find(e => e.date >= trajectory.startDate);
      if (startEntry) {
        const startWeight = startEntry.weight;
        const sign = trajectory.phaseType === 'building' ? 1 : -1;
        const startMs = new Date(trajectory.startDate + 'T00:00:00Z').getTime();

        chartData = entries.map(e => {
          const inRange = e.date >= trajectory.startDate && (!trajectory.endDate || e.date <= trajectory.endDate);
          if (!inRange) return { ...e, bandMin: null, bandMax: null, bandDelta: null };
          const weeks = (new Date(e.date + 'T00:00:00Z').getTime() - startMs) / (7 * 24 * 60 * 60 * 1000);
          const bMin = Number((startWeight + sign * trajectory.minRate * weeks).toFixed(1));
          const bMax = Number((startWeight + sign * trajectory.maxRate * weeks).toFixed(1));
          const lo = Math.min(bMin, bMax);
          const hi = Math.max(bMin, bMax);
          return { ...e, bandMin: lo, bandMax: hi, bandDelta: Number((hi - lo).toFixed(1)) };
        });
        hasBand = chartData.some(d => d.bandMin != null);
      }
    } else if (!rate && trajectory.lowerBand != null && trajectory.upperBand != null) {
      chartData = entries.map(e => {
        const inRange = e.date >= trajectory.startDate && (!trajectory.endDate || e.date <= trajectory.endDate);
        if (!inRange) return { ...e, bandMin: null, bandMax: null, bandDelta: null };
        const lo = Math.min(trajectory.lowerBand, trajectory.upperBand);
        const hi = Math.max(trajectory.lowerBand, trajectory.upperBand);
        return { ...e, bandMin: lo, bandMax: hi, bandDelta: Number((hi - lo).toFixed(1)) };
      });
      hasBand = chartData.some(d => d.bandMin != null);
    }
  }

  const yValues = chartData.flatMap(d => [d.weight, d.bandMin, d.bandMax].filter(v => v != null));
  const yDomain = yValues.length > 0
    ? [Math.floor(Math.min(...yValues) - 1), Math.ceil(Math.max(...yValues) + 1)]
    : ['auto', 'auto'];

  let legendText = null;
  if (trajectory) {
    const label = PHASE_LABELS[trajectory.phaseType];
    const from = fmtShort(trajectory.startDate);
    const to = trajectory.endDate ? fmtShort(trajectory.endDate) : 'ongoing';
    if (isRatePhase(trajectory.phaseType)) {
      const verb = trajectory.phaseType === 'fat_loss' ? 'loss' : 'gain';
      legendText = `${label} phase: ${from} to ${to} - target ${trajectory.minRate} to ${trajectory.maxRate} kg/week ${verb}`;
    } else {
      legendText = `${label} phase: ${from} to ${to} - target band ${trajectory.lowerBand} to ${trajectory.upperBand} kg`;
    }
  }

  return { chartData, hasBand, yDomain, colors, legendText };
}

/**
 * Where the latest weight sits against the band on the same day.
 * Returns 'above', 'below', 'inside' or null when there is no band to compare to.
 */
export function bandPosition(chartData) {
  if (!chartData || chartData.length === 0) return null;
  for (let i = chartData.length - 1; i >= 0; i--) {
    const d = chartData[i];
    if (d.weight == null || d.bandMin == null || d.bandMax == null) continue;
    if (d.weight > d.bandMax) return 'above';
    if (d.weight < d.bandMin) return 'below';
    return 'inside';
  }
  return null;
}
