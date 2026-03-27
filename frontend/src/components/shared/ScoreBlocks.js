import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer,
} from 'recharts';

// --- Colour helpers ---

// Raw 1-10 score colour coding (non-stress)
export function rawScoreColor(value) {
  if (value == null) return '#555e62';
  if (value >= 8) return '#22c55e';
  if (value >= 6) return '#f59e0b';
  if (value >= 4) return '#fcd34d';
  return '#ef4444';
}

// Stress is inverted: low raw = good
export function stressScoreColor(value) {
  if (value == null) return '#555e62';
  if (value >= 8) return '#ef4444';
  if (value >= 6) return '#f59e0b';
  if (value >= 4) return '#fcd34d';
  return '#22c55e';
}

// Total weighted score band colour
export function totalBandColor(total) {
  if (total == null) return '#555e62';
  if (total >= 38) return '#22c55e';
  if (total >= 31) return '#4ade80';
  if (total >= 24) return '#f59e0b';
  if (total >= 17) return '#fca5a5';
  return '#ef4444';
}

// Total weighted score band label
export function totalBandLabel(total) {
  if (total == null) return '';
  if (total >= 38) return 'Sharp across the board';
  if (total >= 31) return 'Dialled in';
  if (total >= 24) return 'In control';
  if (total >= 17) return 'Not bad';
  return 'Rough week';
}

// Get Monday of the week from a cycle_start (Sunday) date
export function cycleToMonday(cycleStart) {
  if (!cycleStart) return '';
  const dateStr = typeof cycleStart === 'string' ? cycleStart.split('T')[0] : cycleStart;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Get Monday date string (YYYY-MM-DD) from a cycle_start for focus lookup
export function cycleToMondayISO(cycleStart) {
  if (!cycleStart) return null;
  const dateStr = typeof cycleStart === 'string' ? cycleStart.split('T')[0] : cycleStart;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

// Custom dot that shows the value label
function TrendDot({ cx, cy, payload, dataKey, stroke }) {
  const val = payload[dataKey];
  if (val == null || cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3} fill={stroke} />
      <text x={cx} y={cy - 8} textAnchor="middle" fill={stroke} fontSize={10} fontWeight={600}>
        {val}
      </text>
    </g>
  );
}

// --- Score Block with 8-week trend tooltip ---

export function ScoreBlock({ label, value, trend, trendKey, isStress }) {
  const [showTrend, setShowTrend] = useState(false);
  const hex = isStress ? stressScoreColor(value) : rawScoreColor(value);

  return (
    <div
      className="score-block"
      style={{ borderColor: hex }}
      onMouseEnter={() => setShowTrend(true)}
      onMouseLeave={() => setShowTrend(false)}
    >
      <span className="score-block__value" style={{ color: hex }}>{value ?? '-'}</span>
      <span className="score-block__label">{label}</span>
      {showTrend && trend && trend.length > 1 && (
        <div className="score-block__trend">
          <ResponsiveContainer width={280} height={120}>
            <LineChart data={trend} margin={{ top: 16, right: 12, bottom: 4, left: 12 }}>
              <XAxis
                dataKey="weekStart"
                tickFormatter={cycleToMonday}
                tick={{ fontSize: 9, fill: '#555e62' }}
                interval={0}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={[0, 10]} />
              <ReferenceLine y={8} stroke="#e2e5e8" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey={trendKey}
                stroke={hex}
                strokeWidth={2}
                dot={<TrendDot dataKey={trendKey} stroke={hex} />}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <span className="score-block__trend-label">Last {trend.length} weeks</span>
        </div>
      )}
    </div>
  );
}

export function TotalBadge({ total, trend }) {
  const [showTrend, setShowTrend] = useState(false);
  const hex = totalBandColor(total);
  const band = totalBandLabel(total);

  return (
    <div
      className="total-badge"
      style={{ borderColor: hex }}
      onMouseEnter={() => setShowTrend(true)}
      onMouseLeave={() => setShowTrend(false)}
    >
      <div className="total-badge__inner">
        <div className="total-badge__score-line">
          <span className="total-badge__value" style={{ color: hex }}>{total ?? '-'}</span>
          <span className="total-badge__max">/45</span>
        </div>
        {band && <span className="total-badge__band" style={{ color: hex }}>{band}</span>}
      </div>
      {showTrend && trend && trend.length > 1 && (
        <div className="score-block__trend score-block__trend--right">
          <ResponsiveContainer width={280} height={120}>
            <LineChart data={trend} margin={{ top: 16, right: 12, bottom: 4, left: 12 }}>
              <XAxis
                dataKey="weekStart"
                tickFormatter={cycleToMonday}
                tick={{ fontSize: 9, fill: '#555e62' }}
                interval={0}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={[0, 45]} />
              <ReferenceLine y={38} stroke="#e2e5e8" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="totalWeighted"
                stroke={hex}
                strokeWidth={2}
                dot={<TrendDot dataKey="totalWeighted" stroke={hex} />}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <span className="score-block__trend-label">Last {trend.length} weeks</span>
        </div>
      )}
    </div>
  );
}
