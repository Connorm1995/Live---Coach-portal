import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  BarChart, ComposedChart, LineChart, Line, Area, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { cycleToMonday } from './shared/ScoreBlocks';
import { buildTrajectoryChart, bandPosition } from './shared/trajectory';
import './CheckinMode.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

// ─── Panels ─────────────────────────────────────────────────────────

const PANELS = [
  { key: 'week',    label: 'The week' },
  { key: 'words',   label: 'What you told me' },
  { key: 'numbers', label: 'The numbers' },
  { key: 'work',    label: 'The work' },
  { key: 'focus',   label: "This week's focus" },
];

const STRIP_DAYS = 14;

// ─── Score presentation ─────────────────────────────────────────────

// Tinted card + dark ink, rather than white-on-colour. Solid fills lose their
// text to video compression, and the light amber failed contrast outright.
const TONES = {
  great: { bg: '#eafaf0', fg: '#15803d', bar: '#22c55e' },
  good:  { bg: '#fff7e6', fg: '#b45309', bar: '#f59e0b' },
  fair:  { bg: '#fefce8', fg: '#a16207', bar: '#eab308' },
  poor:  { bg: '#fef2f2', fg: '#b91c1c', bar: '#ef4444' },
  none:  { bg: '#f4f5f6', fg: '#6b7280', bar: '#d1d5db' },
};

function toneFor(value, isStress) {
  if (value == null) return TONES.none;
  // Stress is the one inverted question: a high answer is a bad week.
  const v = isStress ? 11 - value : value;
  if (v >= 8) return TONES.great;
  if (v >= 6) return TONES.good;
  if (v >= 4) return TONES.fair;
  return TONES.poor;
}

function totalTone(total) {
  if (total == null) return TONES.none;
  if (total >= 38) return TONES.great;
  if (total >= 31) return TONES.great;
  if (total >= 24) return TONES.good;
  if (total >= 17) return TONES.fair;
  return TONES.poor;
}

function totalBand(total) {
  if (total == null) return '';
  if (total >= 38) return 'Sharp across the board';
  if (total >= 31) return 'Dialled in';
  if (total >= 24) return 'In control';
  if (total >= 17) return 'Not bad';
  return 'Rough week';
}

const SCORE_KEYS = ['overall', 'training', 'steps', 'nutrition', 'sleep', 'digestion', 'stress'];
const SCORE_LABELS = {
  overall: 'Overall', training: 'Training', steps: 'Steps', nutrition: 'Nutrition',
  sleep: 'Sleep', digestion: 'Digestion', stress: 'Stress',
};

// ─── Answer field config ────────────────────────────────────────────

// Only shown when the client actually answered. A follow-up existing at all
// means something went wrong that week, so these are the highest-signal text.
const ISSUE_FIELDS = [
  { key: 'trainingIssue',       label: 'Training',                score: 'training' },
  { key: 'stepIssue',           label: 'Steps',                   score: 'steps' },
  { key: 'nutritionIssue',      label: 'Nutrition',               score: 'nutrition' },
  { key: 'nutritionInfoVsExec', label: 'Information or execution', score: 'nutrition' },
  { key: 'sleepIssue',          label: 'Sleep',                   score: 'sleep' },
  { key: 'digestionIssue',      label: 'Digestion',               score: 'digestion' },
  { key: 'stressSource',        label: 'Stress',                  score: 'stress' },
  { key: 'toughWeekNote',       label: 'Tough week, asked again', score: null },
  { key: 'hindsight',           label: 'In hindsight',            score: null },
];

const OPEN_FIELDS = [
  { key: 'wins',           label: 'Biggest win' },
  { key: 'helpNeeded',     label: 'Where they want help' },
  { key: 'upcomingEvents', label: 'Coming up' },
];

// ─── Date helpers (Dublin) ──────────────────────────────────────────

function dublinToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
}

// Anchored at midday UTC so a DST switch cannot roll a date backwards.
function lastNDays(n, endDateStr) {
  const end = new Date(endDateStr + 'T12:00:00Z').getTime();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(end - i * 86400000).toISOString().split('T')[0]);
  }
  return out;
}

function fmtDayNum(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-IE', { day: 'numeric', timeZone: 'UTC' });
}

function fmtDayLetter(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-IE', { weekday: 'short', timeZone: 'UTC' });
}

function fmtShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function fmtDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { weekday: 'short', timeZone: 'UTC' });
}

// ─── Small shared pieces ────────────────────────────────────────────

function Delta({ value, invert, suffix }) {
  // No previous check-in to compare against is not the same as no change, and
  // showing "Level" for both was misreading a first week as a flat one.
  if (value == null) return <span className="checkin-mode-delta checkin-mode-delta--none" />;
  if (value === 0) {
    return <span className="checkin-mode-delta checkin-mode-delta--flat">Level</span>;
  }
  const good = invert ? value < 0 : value > 0;
  const sign = value > 0 ? '+' : '';
  return (
    // The arrow follows the direction the number moved, the colour says whether
    // that was good. Tying the arrow to "good" pointed a weight loss upwards.
    <span className={`checkin-mode-delta ${good ? 'checkin-mode-delta--up' : 'checkin-mode-delta--down'}`}>
      {value > 0 ? '▲' : '▼'} {sign}{value}{suffix || ''}
    </span>
  );
}

function TrendDot({ cx, cy, payload, dataKey, stroke }) {
  const val = payload[dataKey];
  if (val == null || cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={stroke} />
      <text x={cx} y={cy - 14} textAnchor="middle" fill={stroke} fontSize={15} fontWeight={700}>
        {val}
      </text>
    </g>
  );
}

function PanelHeading({ children, sub }) {
  return (
    <div className="checkin-mode-panel__heading">
      <h2 className="checkin-mode-panel__title">{children}</h2>
      {sub && <span className="checkin-mode-panel__sub">{sub}</span>}
    </div>
  );
}

function Empty({ children }) {
  return <div className="checkin-mode-empty">{children}</div>;
}

// ─── Panel 1: The week ──────────────────────────────────────────────

function WeekPanel({ checkin, previous, trend }) {
  const scores = checkin?.scores;
  const total = scores?.totalWeighted ?? null;
  const prevTotal = previous?.scores?.totalWeighted ?? null;
  const totalDelta = (total != null && prevTotal != null) ? total - prevTotal : null;
  const tone = totalTone(total);

  if (!scores) return <Empty>No scores on this check-in.</Empty>;

  return (
    <div className="checkin-mode-week">
      <div className="checkin-mode-week__top">
        <div className="checkin-mode-week__total" style={{ background: tone.bg }}>
          <div className="checkin-mode-week__total-line">
            <span className="checkin-mode-week__total-value" style={{ color: tone.fg }}>{total ?? '-'}</span>
            <span className="checkin-mode-week__total-max">/45</span>
          </div>
          <span className="checkin-mode-week__total-band" style={{ color: tone.fg }}>{totalBand(total)}</span>
          {totalDelta != null && (
            <span className="checkin-mode-week__total-delta">
              {totalDelta === 0
                ? 'Same as last check-in'
                : <><Delta value={totalDelta} /> on last check-in</>}
            </span>
          )}
        </div>

        <div className="checkin-mode-week__trend">
          <span className="checkin-mode-week__trend-label">Total score, last {trend.length} check-ins</span>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={trend} margin={{ top: 26, right: 20, bottom: 4, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={cycleToMonday}
                  tick={{ fontSize: 13, fill: 'var(--color-slate)' }}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide type="number" domain={[0, 45]} />
                <ReferenceLine y={38} stroke="#cbd5d8" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="totalWeighted"
                  stroke={tone.bar}
                  strokeWidth={3}
                  isAnimationActive={false}
                  dot={<TrendDot dataKey="totalWeighted" stroke={tone.bar} />}
                  activeDot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Not enough history yet for a trend.</Empty>
          )}
        </div>
      </div>

      <div className="checkin-mode-week__scores">
        {SCORE_KEYS.map(key => {
          const value = scores.raw?.[key] ?? null;
          const prevValue = previous?.scores?.raw?.[key] ?? null;
          const delta = (value != null && prevValue != null) ? value - prevValue : null;
          const isStress = key === 'stress';
          const t = toneFor(value, isStress);
          return (
            <div key={key} className="checkin-mode-score" style={{ background: t.bg }}>
              <span className="checkin-mode-score__bar" style={{ background: t.bar }} />
              <span className="checkin-mode-score__label">{SCORE_LABELS[key]}</span>
              <span className="checkin-mode-score__value" style={{ color: t.fg }}>{value ?? '-'}</span>
              <Delta value={delta} invert={isStress} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panel 2: What you told me ──────────────────────────────────────

function WordsPanel({ checkin }) {
  const answers = checkin?.formAnswers || {};
  const scores = checkin?.scores;

  const chips = [
    scores?.daysOnPlan ? { label: 'Days on plan', value: scores.daysOnPlan } : null,
    scores?.progressDirection ? { label: 'Progress', value: scores.progressDirection } : null,
    answers.effort ? { label: 'Effort', value: answers.effort } : null,
    answers.directionConfidence ? { label: 'Confidence in direction', value: answers.directionConfidence } : null,
    answers.alcohol ? { label: 'Alcohol', value: answers.alcohol } : null,
  ].filter(Boolean);

  const issues = ISSUE_FIELDS
    .map(f => ({ ...f, value: answers[f.key] }))
    .filter(f => f.value);

  return (
    <div className="checkin-mode-words">
      {chips.length > 0 && (
        <div className="checkin-mode-chips">
          {chips.map(c => (
            <div key={c.label} className="checkin-mode-chip">
              <span className="checkin-mode-chip__label">{c.label}</span>
              <span className="checkin-mode-chip__value">{c.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="checkin-mode-words__open">
        {OPEN_FIELDS.map(f => (
          <div key={f.key} className="checkin-mode-card">
            <span className="checkin-mode-card__label">{f.label}</span>
            {answers[f.key]
              ? <p className="checkin-mode-card__text">{answers[f.key]}</p>
              : <p className="checkin-mode-card__text checkin-mode-card__text--muted">Nothing noted</p>}
          </div>
        ))}
      </div>

      <div className="checkin-mode-words__issues">
        <span className="checkin-mode-words__issues-label">What went wrong</span>
        {issues.length === 0 ? (
          <div className="checkin-mode-clear">No problem areas flagged this week.</div>
        ) : (
          <div className="checkin-mode-words__issue-list">
            {issues.map(f => {
              const raw = f.score ? scores?.raw?.[f.score] : null;
              const t = toneFor(raw, f.score === 'stress');
              return (
                <div key={f.key} className="checkin-mode-issue" style={{ borderLeftColor: t.bar, background: t.bg }}>
                  <div className="checkin-mode-issue__head">
                    <span className="checkin-mode-issue__label">{f.label}</span>
                    {raw != null && (
                      <span className="checkin-mode-issue__score" style={{ color: t.fg }}>{raw}/10</span>
                    )}
                  </div>
                  <p className="checkin-mode-issue__text">{f.value}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Panel 3: The numbers ───────────────────────────────────────────

const BAND_POSITION_TEXT = {
  above: 'Above the target band',
  below: 'Below the target band',
  inside: 'Tracking inside the target band',
};

function NumbersPanel({ weightData, healthData }) {
  const { entries, trajectory, weightComparison } = weightData || {};
  const { chartData, hasBand, yDomain, colors, legendText } = useMemo(
    () => buildTrajectoryChart(entries, trajectory),
    [entries, trajectory]
  );
  const position = hasBand ? bandPosition(chartData) : null;

  const steps = healthData?.steps;
  const sleep = healthData?.sleep || [];

  // Trainerize returns a full run of zeroes for clients with no wearable rather
  // than an empty array, which drew an axis with nothing under it.
  const hasSteps = (steps?.data || []).some(d => d.count > 0);
  const hasSleep = sleep.some(d => d.hours > 0);

  // The weight endpoint returns weeks newest first, labelled by date range.
  // Relabel by position and flip to oldest first so it reads left to right.
  const WEEK_LABELS = ['Last week', 'Previous week', '3 weeks ago'];
  const weeks = (weightComparison?.weeks || [])
    .slice(0, 3)
    .map((w, i) => ({ ...w, label: WEEK_LABELS[i] || w.label }))
    .reverse();

  return (
    <div className="checkin-mode-numbers">
      <div className="checkin-mode-numbers__main">
        <div className="checkin-mode-block">
          <div className="checkin-mode-block__head">
            <span className="checkin-mode-block__title">Weight trajectory</span>
            {position && (
              <span className="checkin-mode-block__flag">{BAND_POSITION_TEXT[position]}</span>
            )}
          </div>
          {(!entries || entries.length === 0) ? (
            <Empty>No weight data in this range.</Empty>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 20, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tickFormatter={fmtShort} tick={{ fontSize: 13, fill: 'var(--color-slate)' }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 13, fill: 'var(--color-slate)' }} domain={yDomain} tickFormatter={v => `${v} kg`} width={64} />
                  {hasBand && (
                    <>
                      <Area
                        type="monotone" dataKey="bandMax"
                        stroke={colors.stroke} strokeWidth={1} strokeDasharray="4 4"
                        fill={colors.fill} fillOpacity={1}
                        dot={false} activeDot={false} connectNulls={false} isAnimationActive={false}
                      />
                      <Area
                        type="monotone" dataKey="bandMin"
                        stroke={colors.stroke} strokeWidth={1} strokeDasharray="4 4"
                        fill="var(--color-white)" fillOpacity={1}
                        dot={false} activeDot={false} connectNulls={false} isAnimationActive={false}
                      />
                    </>
                  )}
                  <Line
                    type="monotone" dataKey="weight"
                    stroke="var(--color-teal)" strokeWidth={3}
                    dot={{ r: 3, fill: 'var(--color-teal)' }}
                    activeDot={false} isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              {legendText && (
                <div className="checkin-mode-legend">
                  <span className="checkin-mode-legend__swatch" style={{ background: colors.fill.replace('0.12', '0.4') }} />
                  <span className="checkin-mode-legend__text">{legendText}</span>
                </div>
              )}
            </>
          )}
        </div>

        {weeks.length > 0 && (
          <div className="checkin-mode-avgs">
            {weeks.map((w, i) => {
              let delta = null;
              if (i > 0 && weeks[i - 1].average != null && w.average != null) {
                delta = Number((w.average - weeks[i - 1].average).toFixed(1));
              }
              return (
                <React.Fragment key={w.label}>
                  {i > 0 && (
                    <div className="checkin-mode-avgs__delta">
                      {delta != null ? <Delta value={delta} invert suffix=" kg" /> : <span className="checkin-mode-delta checkin-mode-delta--flat">-</span>}
                    </div>
                  )}
                  <div className="checkin-mode-avgs__box">
                    <span className="checkin-mode-avgs__label">{w.label}</span>
                    <span className="checkin-mode-avgs__value">{w.average != null ? `${w.average} kg` : 'No data'}</span>
                    {w.count > 0 && (
                      <span className="checkin-mode-avgs__detail">{w.count} day{w.count !== 1 ? 's' : ''} logged</span>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <div className="checkin-mode-numbers__side">
        <div className="checkin-mode-block">
          <div className="checkin-mode-block__head">
            <span className="checkin-mode-block__title">Steps</span>
            {hasSteps && steps?.average != null && (
              <span className="checkin-mode-block__flag">Avg {steps.average.toLocaleString()}</span>
            )}
          </div>
          {!hasSteps ? (
            <Empty>No step data for this client.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={steps.data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 12, fill: 'var(--color-slate)' }} interval={0} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-slate)' }} domain={[0, 'auto']} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} width={44} />
                {steps.target && (
                  <ReferenceLine y={steps.target} stroke="var(--color-teal)" strokeDasharray="6 3" strokeWidth={2} />
                )}
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={30} fill="var(--color-teal)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {hasSteps && steps?.target && (
            <span className="checkin-mode-block__foot">Dashed line is the {steps.target.toLocaleString()} step target</span>
          )}
        </div>

        <div className="checkin-mode-block">
          <div className="checkin-mode-block__head">
            <span className="checkin-mode-block__title">Sleep</span>
          </div>
          {!hasSleep ? (
            <Empty>No sleep data for this client.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={sleep} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 12, fill: 'var(--color-slate)' }} interval={0} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-slate)' }} domain={[0, 'auto']} tickFormatter={v => `${v}h`} width={44} />
                <ReferenceLine y={7} stroke="var(--color-teal)" strokeDasharray="6 3" strokeWidth={2} />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={30} fill="#8b5cf6" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {hasSleep && <span className="checkin-mode-block__foot">Dashed line is 7 hours</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Panel 4: The work ──────────────────────────────────────────────

function WorkPanel({ dayMap, days, complianceData }) {
  const strengthWeeks = complianceData?.strengthWeekly || [];
  const cardio = Array.isArray(complianceData?.cardioSessions) ? complianceData.cardioSessions : [];
  const maxStrength = Math.max(...strengthWeeks.map(w => w.count), 1);
  const todayStr = dublinToday();

  const fmtDuration = (sec) => {
    if (!sec) return null;
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  };
  const fmtDist = (d) => {
    if (!d) return null;
    return d >= 1 ? `${d.toFixed(1)} km` : `${Math.round(d * 1000)} m`;
  };

  function cellFor(rowKey, date) {
    const d = dayMap[date] || {};
    const acts = d.activities || [];
    switch (rowKey) {
      case 'training': {
        const done = acts.filter(a => a.type === 'strength' && a.status === 'completed');
        const planned = acts.filter(a => a.type === 'strength' && a.status !== 'completed');
        if (done.length) return { text: done.map(a => a.name || 'Session').join(', '), state: 'done' };
        if (planned.length) return { text: planned.map(a => a.name || 'Session').join(', '), state: 'missed' };
        return null;
      }
      case 'cardio': {
        const done = acts.filter(a => (a.type === 'cardio' || a.type === 'walking') && a.status === 'completed');
        const planned = acts.filter(a => (a.type === 'cardio' || a.type === 'walking') && a.status !== 'completed');
        if (done.length) return { text: done.map(a => a.name || 'Cardio').join(', '), state: 'done' };
        if (planned.length) return { text: planned.map(a => a.name || 'Cardio').join(', '), state: 'missed' };
        return null;
      }
      case 'steps': {
        // A zero here means Trainerize had nothing for that day, not that they
        // took no steps, so leave the cell blank rather than scoring it.
        if (!d.steps) return null;
        return {
          text: d.steps >= 1000 ? `${(d.steps / 1000).toFixed(1)}k` : String(d.steps),
          state: d.stepTarget && d.steps >= d.stepTarget ? 'done' : 'low',
        };
      }
      case 'food':
        if (!d.calories) return null;
        return { text: `${d.calories.toLocaleString()}`, state: d.insufficientTracking ? 'low' : 'done' };
      case 'sleep':
        if (d.sleep == null) return null;
        return { text: `${d.sleep}h`, state: d.sleep >= 7 ? 'done' : 'low' };
      case 'weight':
        if (d.weight == null) return null;
        return { text: `${d.weight}`, state: 'neutral' };
      default:
        return null;
    }
  }

  const ROWS = [
    { key: 'training', label: 'Training' },
    { key: 'cardio',   label: 'Cardio' },
    { key: 'steps',    label: 'Steps' },
    { key: 'food',     label: 'Food (kcal)' },
    { key: 'sleep',    label: 'Sleep' },
    { key: 'weight',   label: 'Weight (kg)' },
  ];

  return (
    <div className="checkin-mode-work">
      <div className="checkin-mode-block">
        <div className="checkin-mode-block__head">
          <span className="checkin-mode-block__title">Last {STRIP_DAYS} days</span>
        </div>
        <div className="checkin-mode-strip" style={{ '--checkin-mode-strip-days': days.length }}>
          <div className="checkin-mode-strip__corner" />
          {days.map(date => (
            <div key={`h-${date}`} className={`checkin-mode-strip__day${date === todayStr ? ' checkin-mode-strip__day--today' : ''}`}>
              <span className="checkin-mode-strip__day-letter">{fmtDayLetter(date)}</span>
              <span className="checkin-mode-strip__day-num">{fmtDayNum(date)}</span>
            </div>
          ))}
          {ROWS.map(row => (
            <React.Fragment key={row.key}>
              <div className="checkin-mode-strip__row-label">{row.label}</div>
              {days.map(date => {
                const cell = cellFor(row.key, date);
                return (
                  <div
                    key={`${row.key}-${date}`}
                    className={`checkin-mode-strip__cell${cell ? ` checkin-mode-strip__cell--${cell.state}` : ' checkin-mode-strip__cell--none'}`}
                    title={cell ? cell.text : undefined}
                  >
                    {cell ? cell.text : ''}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="checkin-mode-work__bottom">
        <div className="checkin-mode-block">
          <div className="checkin-mode-block__head">
            <span className="checkin-mode-block__title">Strength sessions per week</span>
          </div>
          {strengthWeeks.length === 0 ? (
            <Empty>No strength data.</Empty>
          ) : (
            <div className="checkin-mode-weeks">
              {strengthWeeks.map((w, i) => (
                <div key={w.weekStart} className="checkin-mode-weeks__block">
                  <div className="checkin-mode-weeks__track">
                    <div className="checkin-mode-weeks__fill" style={{ height: `${(w.count / maxStrength) * 100}%` }} />
                  </div>
                  <span className="checkin-mode-weeks__count">{w.count}</span>
                  <span className="checkin-mode-weeks__label">
                    {i === strengthWeeks.length - 1 ? 'This wk' : `${strengthWeeks.length - 1 - i} wk ago`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="checkin-mode-block">
          <div className="checkin-mode-block__head">
            <span className="checkin-mode-block__title">Cardio sessions</span>
          </div>
          {cardio.length === 0 ? (
            <Empty>No cardio logged.</Empty>
          ) : (
            <div className="checkin-mode-cardio">
              {cardio.slice(0, 8).map((s, i) => {
                const meta = [fmtDuration(s.durationSeconds), fmtDist(s.distance)].filter(Boolean).join(' / ');
                return (
                  <div key={i} className="checkin-mode-cardio__row">
                    <span className="checkin-mode-cardio__name">{s.name || 'Cardio'}</span>
                    {meta && <span className="checkin-mode-cardio__meta">{meta}</span>}
                    <span className="checkin-mode-cardio__date">{fmtShort(s.date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel 5: This week's focus ─────────────────────────────────────

function FocusPanel({ focus, checkin, clientId, onSaved }) {
  const [text, setText] = useState(focus?.current?.text || '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const debounceRef = useRef(null);
  const areaRef = useRef(null);

  useEffect(() => {
    setText(focus?.current?.text || '');
  }, [focus]);

  useEffect(() => {
    const t = setTimeout(() => areaRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const save = useCallback(async (value) => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/overview/${clientId}/focus`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, weekStart: focus?.current?.weekStart }),
      });
      setSavedAt(Date.now());
      if (onSaved) onSaved();
    } catch (err) {
      console.error('Failed to save focus:', err);
    } finally {
      setSaving(false);
    }
  }, [clientId, focus, onSaved]);

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(val), 800);
  };

  // Cues so the focus is written against what the week actually flagged.
  const answers = checkin?.formAnswers || {};
  const cues = ISSUE_FIELDS.filter(f => answers[f.key]).map(f => f.label);

  return (
    <div className="checkin-mode-focus">
      {focus?.previous?.text && (
        <div className="checkin-mode-focus__prev">
          <span className="checkin-mode-focus__prev-label">Last week you asked for</span>
          <p className="checkin-mode-focus__prev-text">{focus.previous.text}</p>
        </div>
      )}

      <textarea
        ref={areaRef}
        className="checkin-mode-focus__input"
        value={text}
        onChange={handleChange}
        placeholder="What are they working on this week?"
        rows={6}
      />

      <div className="checkin-mode-focus__foot">
        {cues.length > 0 && (
          <span className="checkin-mode-focus__cues">Flagged this week: {cues.join(', ')}</span>
        )}
        <span className="checkin-mode-focus__save">
          {saving ? 'Saving...' : savedAt ? 'Saved' : ''}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

function CheckinMode({
  isOpen, onClose, clientId, client,
  summaryData, weightData, healthData, complianceData, calendarData,
  checkinIndex, onFocusSaved,
}) {
  const [panel, setPanel] = useState(0);
  const [hintsVisible, setHintsVisible] = useState(true);
  const [extraDays, setExtraDays] = useState([]);
  const hintTimerRef = useRef(null);

  const days = useMemo(() => lastNDays(STRIP_DAYS, dublinToday()), []);

  // Reset to the first panel each time the mode is opened.
  useEffect(() => {
    if (isOpen) setPanel(0);
  }, [isOpen]);

  // The strip window usually crosses a month boundary, and the Overview only
  // holds the month it is currently showing. Fetch every month the window
  // touches so the last 14 days are never half empty.
  useEffect(() => {
    if (!isOpen || !clientId) return;
    let cancelled = false;
    const months = [...new Set(days.map(d => d.slice(0, 7)))];

    Promise.all(
      months.map(m =>
        fetch(`${API_BASE}/api/client-overview/${clientId}/calendar?month=${m}`)
          .then(r => r.ok ? r.json() : { days: [] })
          .catch(() => ({ days: [] }))
      )
    ).then(results => {
      if (cancelled) return;
      setExtraDays(results.flatMap(r => r.days || []));
    });

    return () => { cancelled = true; };
  }, [isOpen, clientId, days]);

  // Hide the keyboard hints once recording is under way, bring them back on move.
  useEffect(() => {
    if (!isOpen) return;
    const bump = () => {
      setHintsVisible(true);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => setHintsVisible(false), 4000);
    };
    bump();
    window.addEventListener('mousemove', bump);
    return () => {
      window.removeEventListener('mousemove', bump);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [isOpen]);

  // Lock the page behind the overlay so a stray scroll cannot move it on camera.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const go = useCallback((delta) => {
    setPanel(p => Math.min(PANELS.length - 1, Math.max(0, p + delta)));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      const tag = e.target?.tagName;
      const typing = tag === 'TEXTAREA' || tag === 'INPUT';

      if (e.key === 'Escape') {
        // Escape steps out of the focus field first, then out of the mode.
        if (typing) { e.target.blur(); return; }
        onClose();
        return;
      }
      if (typing) return;

      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(-1);
      } else if (/^[1-5]$/.test(e.key)) {
        setPanel(Number(e.key) - 1);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, go]);

  // Merge whatever the Overview already had with the months fetched here.
  const dayMap = useMemo(() => {
    const map = {};
    for (const d of (calendarData?.days || [])) map[d.date] = { ...d };
    for (const d of extraDays) map[d.date] = { ...(map[d.date] || {}), ...d };
    const target = healthData?.steps?.target;
    for (const s of (healthData?.steps?.data || [])) {
      map[s.date] = { ...(map[s.date] || { date: s.date }), steps: s.count, stepTarget: target };
    }
    return map;
  }, [calendarData, extraDays, healthData]);

  const checkins = summaryData?.checkins || [];
  const checkin = checkins[checkinIndex] || checkins[0] || null;
  const previous = checkins[(checkinIndex || 0) + 1] || null;

  // Trend runs to the check-in being shown, so an older week is not compared
  // against data the client had not produced yet.
  const trend = useMemo(() => {
    const full = summaryData?.scoreTrend || [];
    if (!checkin?.cycleStart) return full;
    const idx = full.findIndex(t => t.weekStart === checkin.cycleStart);
    return idx >= 0 ? full.slice(0, idx + 1) : full;
  }, [summaryData, checkin]);

  if (!isOpen) return null;

  const current = PANELS[panel];
  const isCurrentCheckin = (checkinIndex || 0) === 0;
  const checkinLabel = checkin
    ? (isCurrentCheckin ? 'Latest check-in' : `Check-in week of ${cycleToMonday(checkin.cycleStart)}`)
    : 'No check-in';

  return (
    <div className="checkin-mode" role="dialog" aria-label="Check-in Mode" aria-modal="true">
      <header className="checkin-mode__bar">
        <div className="checkin-mode__bar-left">
          <span className="checkin-mode__client">{client?.name || 'Client'}</span>
          <span className="checkin-mode__meta">{checkinLabel}</span>
        </div>
        <span className="checkin-mode__panel-name">{current.label}</span>
        <div className="checkin-mode__bar-right">
          <span className="checkin-mode__count">{panel + 1} / {PANELS.length}</span>
          <button className="checkin-mode__exit" onClick={onClose} aria-label="Exit Check-in Mode">
            Exit
            <span className={`checkin-mode__exit-key${hintsVisible ? '' : ' checkin-mode__exit-key--dim'}`}>Esc</span>
          </button>
        </div>
      </header>

      <main className="checkin-mode__stage">
        <PanelHeading sub={current.key === 'work' ? `To ${fmtShort(dublinToday())} (Dublin time)` : null}>
          {current.label}
        </PanelHeading>

        {current.key === 'week' && (
          checkin
            ? <WeekPanel checkin={checkin} previous={previous} trend={trend} />
            : <Empty>No check-in has been submitted yet.</Empty>
        )}
        {current.key === 'words' && (
          checkin
            ? <WordsPanel checkin={checkin} />
            : <Empty>No check-in has been submitted yet.</Empty>
        )}
        {current.key === 'numbers' && (
          <NumbersPanel weightData={weightData} healthData={healthData} />
        )}
        {current.key === 'work' && (
          <WorkPanel dayMap={dayMap} days={days} complianceData={complianceData} />
        )}
        {current.key === 'focus' && (
          <FocusPanel
            focus={summaryData?.focus}
            checkin={checkin}
            clientId={clientId}
            onSaved={onFocusSaved}
          />
        )}
      </main>

      <footer className="checkin-mode__steps">
        {PANELS.map((p, i) => (
          <button
            key={p.key}
            className={`checkin-mode__step${i === panel ? ' checkin-mode__step--active' : ''}${i < panel ? ' checkin-mode__step--done' : ''}`}
            onClick={() => setPanel(i)}
          >
            <span className="checkin-mode__step-bar" />
            <span className="checkin-mode__step-label">{p.label}</span>
          </button>
        ))}
      </footer>

      <div className={`checkin-mode__hints${hintsVisible ? '' : ' checkin-mode__hints--hidden'}`}>
        Arrow keys to move, 1 to 5 to jump, Esc to exit
      </div>
    </div>
  );
}

export default CheckinMode;
