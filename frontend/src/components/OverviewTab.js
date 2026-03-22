import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, BarChart, ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import './OverviewTab.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

// --- Helpers ---

// Raw 1-10 score colour coding (non-stress)
function rawScoreColor(value) {
  if (value == null) return '#555e62';
  if (value >= 8) return '#22c55e';
  if (value >= 6) return '#f59e0b';
  if (value >= 4) return '#fcd34d';
  return '#ef4444';
}

// Stress is inverted: low raw = good
function stressScoreColor(value) {
  if (value == null) return '#555e62';
  if (value >= 8) return '#ef4444';
  if (value >= 6) return '#f59e0b';
  if (value >= 4) return '#fcd34d';
  return '#22c55e';
}

// Total weighted score band colour
function totalBandColor(total) {
  if (total == null) return '#555e62';
  if (total >= 38) return '#22c55e';
  if (total >= 31) return '#4ade80';
  if (total >= 24) return '#f59e0b';
  if (total >= 17) return '#fca5a5';
  return '#ef4444';
}

// Total weighted score band label
function totalBandLabel(total) {
  if (total == null) return '';
  if (total >= 38) return 'Sharp across the board';
  if (total >= 31) return 'Dialled in';
  if (total >= 24) return 'In control';
  if (total >= 17) return 'Not bad';
  return 'Rough week';
}

function fmtDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { weekday: 'short', timeZone: 'UTC' });
}

function fmtShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function fmtDayShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.toLocaleDateString('en-IE', { weekday: 'short', timeZone: 'UTC' });
  const num = d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day} ${num}`;
}

// Get Monday of the week from a cycle_start (Sunday) date - handles both "YYYY-MM-DD" and ISO datetime
function cycleToMonday(cycleStart) {
  if (!cycleStart) return '';
  const dateStr = typeof cycleStart === 'string' ? cycleStart.split('T')[0] : cycleStart;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Get Monday date string (YYYY-MM-DD) from a cycle_start for focus lookup
function cycleToMondayISO(cycleStart) {
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

function ScoreBlock({ label, value, trend, trendKey, isStress }) {
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

function TotalBadge({ total, trend }) {
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

// --- Check-in Form Summary ---

const CARD_ACCENTS = {
  'Biggest wins this week': { border: 'var(--color-green)', bg: 'rgba(34, 197, 94, 0.05)' },
  'Stress source': { border: 'var(--color-red)', bg: 'rgba(239, 68, 68, 0.05)' },
  'Where do you need help': { border: 'var(--color-teal)', bg: 'rgba(35, 184, 184, 0.05)' },
  'Upcoming events': { border: 'var(--color-amber)', bg: 'rgba(245, 158, 11, 0.05)' },
};

function FormSummaryCard({ title, text }) {
  if (!text) return null;
  const accent = CARD_ACCENTS[title] || { border: 'var(--color-border)', bg: 'transparent' };
  return (
    <div className="form-card" style={{ borderLeftColor: accent.border, backgroundColor: accent.bg }}>
      <h4 className="form-card__title">{title}</h4>
      <p className="form-card__text">{text}</p>
    </div>
  );
}

// --- Previous Check-ins ---

const BLOCK_LABELS = ['Overall', 'Training', 'Steps', 'Nutrition', 'Sleep', 'Digestion', 'Stress'];
const BLOCK_KEYS = ['overall', 'training', 'steps', 'nutrition', 'sleep', 'digestion', 'stress'];

function PrevCheckinFocus({ clientId, cycleStart, initialText }) {
  const [text, setText] = useState(initialText || '');
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    setText(initialText || '');
  }, [initialText]);

  const save = useCallback(async (value) => {
    const weekStart = cycleToMondayISO(cycleStart);
    if (!weekStart) return;
    try {
      await fetch(`${API_BASE}/api/overview/${clientId}/focus`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, weekStart }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error('Failed to save focus:', err);
    }
  }, [clientId, cycleStart]);

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    setSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(val), 800);
  };

  return (
    <div className="prev-checkin__focus">
      <span className="prev-checkin__focus-label">FOCUS SET THIS WEEK</span>
      <textarea
        className="prev-checkin__focus-input"
        value={text}
        onChange={handleChange}
        placeholder="Write focus points for this week..."
        rows={2}
      />
      {saved && <span className="prev-checkin__focus-saved">Saved</span>}
    </div>
  );
}

function PreviousCheckins({ checkins, allFocus, clientId }) {
  const [expanded, setExpanded] = useState(null);
  const [open, setOpen] = useState(false);

  if (!checkins || checkins.length === 0) return null;

  return (
    <div className="overview-section">
      <button className="prev-checkins__toggle" onClick={() => setOpen(!open)}>
        <h3 className="overview-section__title" style={{ margin: 0 }}>Previous Check-ins</h3>
        <span className="prev-checkins__arrow">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="prev-checkins__list">
          {checkins.map((ci, idx) => {
            const isExpanded = expanded === idx;
            const total = ci.scores?.totalWeighted;
            const hex = totalBandColor(total);
            const band = totalBandLabel(total);
            const mondayLabel = cycleToMonday(ci.cycleStart);
            const focusMonday = cycleToMondayISO(ci.cycleStart);
            const focusText = focusMonday ? allFocus?.[focusMonday] : null;

            return (
              <div key={ci.id} className="prev-checkin">
                <button
                  className={`prev-checkin__header${isExpanded ? ' prev-checkin__header--active' : ''}`}
                  onClick={() => setExpanded(isExpanded ? null : idx)}
                >
                  <span className="prev-checkin__date">{mondayLabel}</span>
                  <span className="prev-checkin__badge" style={{ color: hex, borderColor: hex }}>
                    {total ?? '-'}/45
                  </span>
                  <span className="prev-checkin__band" style={{ color: hex }}>{band}</span>
                  <span className="prev-checkin__arrow">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </button>
                {isExpanded && (
                  <div className="prev-checkin__body">
                    <div className="prev-checkin__scores">
                      {BLOCK_KEYS.map((key, i) => {
                        const raw = ci.scores?.raw?.[key];
                        const color = key === 'stress' ? stressScoreColor(raw) : rawScoreColor(raw);
                        return (
                          <div key={key} className="prev-checkin__score" style={{ borderColor: color }}>
                            <span style={{ color, fontWeight: 700, fontSize: 18 }}>{raw ?? '-'}</span>
                            <span style={{ fontSize: 10, color: '#555e62' }}>{BLOCK_LABELS[i]}</span>
                          </div>
                        );
                      })}
                    </div>
                    {ci.formAnswers && (
                      <div className="form-cards" style={{ marginTop: 'var(--space-3)' }}>
                        <FormSummaryCard title="Biggest wins this week" text={ci.formAnswers.wins} />
                        <FormSummaryCard title="Stress source" text={ci.formAnswers.stressSource} />
                        <FormSummaryCard title="Where do you need help" text={ci.formAnswers.helpNeeded} />
                        <FormSummaryCard title="Upcoming events" text={ci.formAnswers.upcomingEvents} />
                      </div>
                    )}
                    <PrevCheckinFocus
                      clientId={clientId}
                      cycleStart={ci.cycleStart}
                      initialText={focusText}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Weekly Focus ---

function WeeklyFocus({ focus, clientId, onSaved }) {
  const [text, setText] = useState(focus?.current?.text || '');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    setText(focus?.current?.text || '');
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (value) => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/overview/${clientId}/focus`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, weekStart: focus?.current?.weekStart }),
      });
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

  return (
    <div className="overview-section">
      <h3 className="overview-section__title">This Week's Focus</h3>
      {focus?.previous?.text && (
        <div className="focus-previous">
          <span className="focus-previous__label">Last week's focus:</span>
          <span className="focus-previous__text">{focus.previous.text}</span>
        </div>
      )}
      <textarea
        className="focus-input"
        value={text}
        onChange={handleChange}
        placeholder="Write up to three priority focus points for this client..."
        rows={3}
      />
      {saving && <span className="focus-saving">Saving...</span>}
    </div>
  );
}

// --- Custom chart tooltip ---

function ChartTooltip({ active, payload, labelFormatter, valueFormatter, valueSuffix }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0];
  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip__label">{labelFormatter ? labelFormatter(d.payload) : d.payload.date}</span>
      <span className="chart-tooltip__value">
        {valueFormatter ? valueFormatter(d.value) : d.value}{valueSuffix || ''}
      </span>
    </div>
  );
}

// --- Sleep Graph ---

function SleepGraph({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="overview-section">
        <h3 className="overview-section__title">Sleep <span className="data-source">Trainerize</span></h3>
        <div className="empty-state">No sleep data available</div>
      </div>
    );
  }

  return (
    <div className="overview-section">
      <h3 className="overview-section__title">Sleep - Last 10 Days <span className="data-source">Trainerize</span></h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDay}
            tick={{ fontSize: 11, fill: 'var(--color-slate)' }}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--color-slate)' }}
            domain={[0, 'auto']}
            tickFormatter={v => `${v}h`}
          />
          <Tooltip
            content={({ active, payload }) => (
              <ChartTooltip
                active={active}
                payload={payload}
                labelFormatter={(p) => fmtDayShort(p.date)}
                valueFormatter={(v) => `${v.toFixed(1)}`}
                valueSuffix=" hrs"
              />
            )}
          />
          <Bar dataKey="hours" fill="var(--color-teal)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
      {data.some(d => d.bedtime || d.wakeTime) && (
        <div className="sleep-times">
          {data.filter(d => d.bedtime || d.wakeTime).map((d, i) => (
            <div key={i} className="sleep-times__entry">
              <span className="sleep-times__day">{fmtDay(d.date)}</span>
              {d.bedtime && <span className="sleep-times__bed">Bed: {d.bedtime}</span>}
              {d.wakeTime && <span className="sleep-times__wake">Wake: {d.wakeTime}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Steps Graph ---

function StepsGraph({ data, target, average }) {
  if (!data || data.length === 0) {
    return (
      <div className="overview-section">
        <h3 className="overview-section__title">Steps <span className="data-source">Trainerize</span></h3>
        <div className="empty-state">No step data available</div>
      </div>
    );
  }

  return (
    <div className="overview-section">
      <h3 className="overview-section__title">
        Steps - Last 10 Days <span className="data-source">Trainerize</span>
        {average != null && (
          <span className="steps-avg">Avg: {average.toLocaleString()}</span>
        )}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDay}
            tick={{ fontSize: 12, fill: 'var(--color-slate)' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--color-slate)' }}
            domain={[0, 'auto']}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          />
          <Tooltip
            content={({ active, payload }) => (
              <ChartTooltip
                active={active}
                payload={payload}
                labelFormatter={(p) => fmtDayShort(p.date)}
                valueFormatter={(v) => v.toLocaleString()}
                valueSuffix=" steps"
              />
            )}
          />
          {target && (
            <ReferenceLine y={target} stroke="var(--color-teal)" strokeDasharray="6 3" label={{ value: `Target: ${target.toLocaleString()}`, position: 'right', fontSize: 11, fill: 'var(--color-teal)' }} />
          )}
          {average != null && (
            <ReferenceLine y={average} stroke="var(--color-amber)" strokeDasharray="4 4" label={{ value: `Avg: ${average.toLocaleString()}`, position: 'left', fontSize: 11, fill: 'var(--color-amber)' }} />
          )}
          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            fill="var(--color-teal)"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Training Compliance ---

function TrainingCompliance({ data }) {
  const { weightSessions, cardioSessions } = data || {};

  return (
    <div className="overview-section">
      <h3 className="overview-section__title">Training Compliance</h3>
      <div className="training-row">
        <div className="training-stat">
          <span className="training-stat__value">
            {weightSessions?.completed ?? 0}/{weightSessions?.programmed ?? 0}
          </span>
          <span className="training-stat__label">Weight sessions</span>
        </div>
        <div className="training-stat">
          <span className="training-stat__value">{cardioSessions ?? 0}</span>
          <span className="training-stat__label">Cardio sessions</span>
        </div>
      </div>
    </div>
  );
}

// --- Nutrition Adherence ---

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function NutritionAdherence({ data, prevWeek }) {
  // Build 7-day row for Mon-Sun
  const dayMap = {};
  if (data) {
    for (const d of data) {
      dayMap[d.date] = d;
    }
  }

  // Generate Mon-Sun dates for the previous week
  const days = [];
  if (prevWeek?.start) {
    const start = new Date(prevWeek.start + 'T00:00:00Z');
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({ date: dateStr, dayName: DAY_NAMES[i], ...dayMap[dateStr] });
    }
  }

  return (
    <div className="overview-section">
      <h3 className="overview-section__title">Nutrition Adherence</h3>
      <div className="nutrition-row">
        {days.map((d, i) => (
          <div key={i} className="nutrition-day">
            <span className="nutrition-day__name">{d.dayName}</span>
            <span className={`nutrition-day__indicator ${d.tracked ? 'nutrition-day__indicator--tracked' : d.tracked === false ? 'nutrition-day__indicator--missed' : ''}`}>
              {d.tracked ? '\u2713' : d.tracked === false ? '\u2717' : '-'}
            </span>
            {d.caloriePercent != null && (
              <span className="nutrition-day__pct">{d.caloriePercent}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Weight Trajectory ---

const PHASE_LABELS = { fat_loss: 'Fat Loss', building: 'Building', recomp: 'Recomp', maintenance: 'Maintenance' };
const PHASE_COLORS = {
  fat_loss:     { stroke: 'var(--color-red)',   fill: 'rgba(239, 68, 68, 0.12)' },
  building:     { stroke: 'var(--color-green)', fill: 'rgba(34, 197, 94, 0.12)' },
  recomp:       { stroke: 'var(--color-teal)',  fill: 'rgba(35, 184, 184, 0.12)' },
  maintenance:  { stroke: 'var(--color-teal)',  fill: 'rgba(35, 184, 184, 0.12)' },
};

function TrajectorySettingsPanel({ settings, clientId, onSaved, onClose }) {
  const isRate = (t) => t === 'fat_loss' || t === 'building';
  const [form, setForm] = useState(() => settings ? {
    phaseType: settings.phaseType,
    startDate: settings.startDate || '',
    endDate: settings.endDate || '',
    minRate: settings.minRate != null ? String(settings.minRate) : '',
    maxRate: settings.maxRate != null ? String(settings.maxRate) : '',
    lowerBand: settings.lowerBand != null ? String(settings.lowerBand) : '',
    upperBand: settings.upperBand != null ? String(settings.upperBand) : '',
  } : {
    phaseType: 'fat_loss', startDate: '', endDate: '',
    minRate: '', maxRate: '', lowerBand: '', upperBand: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        phaseType: form.phaseType,
        startDate: form.startDate,
        endDate: form.endDate || null,
      };
      if (isRate(form.phaseType)) {
        body.minRate = parseFloat(form.minRate) || null;
        body.maxRate = parseFloat(form.maxRate) || null;
      } else {
        body.lowerBand = parseFloat(form.lowerBand) || null;
        body.upperBand = parseFloat(form.upperBand) || null;
      }
      const res = await fetch(`${API_BASE}/api/overview/${clientId}/trajectory-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      onSaved();
    } catch (err) {
      console.error('Trajectory save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/overview/${clientId}/trajectory-settings`, { method: 'DELETE' });
      onSaved();
    } catch (err) {
      console.error('Trajectory clear error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="trajectory-settings__panel">
      <div className="trajectory-settings__phase-selector">
        {Object.entries(PHASE_LABELS).map(([val, label]) => (
          <button
            key={val}
            className={`trajectory-settings__phase-btn${form.phaseType === val ? ' trajectory-settings__phase-btn--active' : ''}`}
            onClick={() => set('phaseType', val)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="trajectory-settings__fields">
        <div className="trajectory-settings__row">
          <label className="trajectory-settings__label">
            Start date
            <input type="date" className="trajectory-settings__input" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </label>
          <label className="trajectory-settings__label">
            End date
            <input type="date" className="trajectory-settings__input" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </label>
        </div>
        {isRate(form.phaseType) ? (
          <div className="trajectory-settings__row">
            <label className="trajectory-settings__label">
              Min rate (kg/week)
              <input type="number" step="0.01" min="0" className="trajectory-settings__input" value={form.minRate} onChange={e => set('minRate', e.target.value)} />
            </label>
            <label className="trajectory-settings__label">
              Max rate (kg/week)
              <input type="number" step="0.01" min="0" className="trajectory-settings__input" value={form.maxRate} onChange={e => set('maxRate', e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="trajectory-settings__row">
            <label className="trajectory-settings__label">
              Lower band (kg)
              <input type="number" step="0.1" min="0" className="trajectory-settings__input" value={form.lowerBand} onChange={e => set('lowerBand', e.target.value)} />
            </label>
            <label className="trajectory-settings__label">
              Upper band (kg)
              <input type="number" step="0.1" min="0" className="trajectory-settings__input" value={form.upperBand} onChange={e => set('upperBand', e.target.value)} />
            </label>
          </div>
        )}
      </div>
      <div className="trajectory-settings__actions">
        {settings && (
          <button className="trajectory-settings__clear" onClick={handleClear} disabled={saving}>Clear</button>
        )}
        <button className="trajectory-settings__cancel" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="trajectory-settings__save" onClick={handleSave} disabled={saving || !form.startDate}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function WeightTrajectory({ data, onRangeChange, weightRange, clientId, onSettingsChanged }) {
  const { entries, trajectory } = data || {};
  const ranges = ['1m', '3m', '6m', '1y'];
  const rangeLabels = { '1m': '1 Month', '3m': '3 Months', '6m': '6 Months', '1y': '1 Year' };
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSettingsSaved = () => {
    setSettingsOpen(false);
    onSettingsChanged();
  };

  // Build overlay band data
  let chartData = entries || [];
  let hasBand = false;
  const colors = trajectory ? PHASE_COLORS[trajectory.phaseType] : null;

  if (trajectory && entries && entries.length > 0) {
    const isRatePhase = trajectory.phaseType === 'fat_loss' || trajectory.phaseType === 'building';

    if (isRatePhase && trajectory.minRate != null && trajectory.maxRate != null) {
      // Find start weight from first weight entry on or after start_date
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
    } else if (!isRatePhase && trajectory.lowerBand != null && trajectory.upperBand != null) {
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

  // Compute Y-axis domain from weight + band values (avoids stacked area forcing baseline to 0)
  const yValues = chartData.flatMap(d => [d.weight, d.bandMin, d.bandMax].filter(v => v != null));
  const yDomain = yValues.length > 0
    ? [Math.floor(Math.min(...yValues) - 1), Math.ceil(Math.max(...yValues) + 1)]
    : ['auto', 'auto'];

  // Build legend text
  let legendText = null;
  if (trajectory) {
    const label = PHASE_LABELS[trajectory.phaseType];
    const from = fmtShort(trajectory.startDate);
    const to = trajectory.endDate ? fmtShort(trajectory.endDate) : 'ongoing';
    const isRatePhase = trajectory.phaseType === 'fat_loss' || trajectory.phaseType === 'building';
    if (isRatePhase) {
      const verb = trajectory.phaseType === 'fat_loss' ? 'loss' : 'gain';
      legendText = `${label} phase: ${from} to ${to} - target ${trajectory.minRate} to ${trajectory.maxRate} kg/week ${verb}`;
    } else {
      legendText = `${label} phase: ${from} to ${to} - target band ${trajectory.lowerBand} to ${trajectory.upperBand} kg`;
    }
  }

  return (
    <div className="overview-section">
      <div className="overview-section__header">
        <h3 className="overview-section__title">
          Weight Trajectory
          <button
            className={`trajectory-settings__trigger${settingsOpen ? ' trajectory-settings__trigger--active' : ''}`}
            onClick={() => setSettingsOpen(!settingsOpen)}
            title="Phase overlay settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!trajectory && <span className="trajectory-settings__dot" />}
          </button>
        </h3>
        <div className="range-toggle">
          {ranges.map(r => (
            <button
              key={r}
              className={`range-toggle__btn ${weightRange === r ? 'range-toggle__btn--active' : ''}`}
              onClick={() => onRangeChange(r)}
            >
              {rangeLabels[r]}
            </button>
          ))}
        </div>
      </div>
      {settingsOpen && (
        <TrajectorySettingsPanel
          settings={trajectory}
          clientId={clientId}
          onSaved={handleSettingsSaved}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {(!entries || entries.length === 0) ? (
        <div className="empty-state">No weight data available</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtShort}
                tick={{ fontSize: 11, fill: 'var(--color-slate)' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--color-slate)' }}
                domain={yDomain}
                tickFormatter={v => `${v} kg`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  const weightPayload = payload?.filter(p => p.dataKey === 'weight');
                  return (
                    <ChartTooltip
                      active={active}
                      payload={weightPayload}
                      labelFormatter={(p) => fmtDayShort(p.date)}
                      valueFormatter={(v) => `${v.toFixed(1)}`}
                      valueSuffix=" kg"
                    />
                  );
                }}
              />
              {hasBand && (
                <>
                  <Area
                    type="monotone"
                    dataKey="bandMax"
                    stroke={colors.stroke}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    fill={colors.fill}
                    fillOpacity={1}
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="bandMin"
                    stroke={colors.stroke}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    fill="var(--color-white)"
                    fillOpacity={1}
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="weight"
                stroke="var(--color-teal)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-teal)' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {legendText && (
            <div className="trajectory-legend">
              <span className="trajectory-legend__swatch" style={{ background: colors.fill.replace('0.12', '0.4') }} />
              <span className="trajectory-legend__text">{legendText}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Weekly Average Body Weight Comparison ---

function WeightComparison({ data }) {
  if (!data) return null;
  const { lastWeek, previousWeek, delta } = data;

  const deltaColor = delta == null ? 'var(--color-slate)'
    : delta > 0 ? 'var(--color-amber)'
    : delta < 0 ? 'var(--color-green)'
    : 'var(--color-slate)';

  const deltaSign = delta > 0 ? '+' : '';

  return (
    <div className="overview-section">
      <h3 className="overview-section__title">Weekly Average Body Weight</h3>
      <div className="weight-comp">
        <div className="weight-comp__box">
          <span className="weight-comp__label">Previous Week</span>
          <span className="weight-comp__avg">
            {previousWeek?.average != null ? `${previousWeek.average} kg` : 'No data'}
          </span>
          {previousWeek?.count > 0 && (
            <span className="weight-comp__detail">
              Based on {previousWeek.count} weigh-in{previousWeek.count !== 1 ? 's' : ''}
            </span>
          )}
          {previousWeek?.dates?.length > 0 && (
            <span className="weight-comp__dates">{previousWeek.dates.map(fmtShort).join(', ')}</span>
          )}
        </div>
        <div className="weight-comp__delta" style={{ color: deltaColor }}>
          {delta != null ? `${deltaSign}${delta} kg` : '-'}
        </div>
        <div className="weight-comp__box">
          <span className="weight-comp__label">Last Week</span>
          <span className="weight-comp__avg">
            {lastWeek?.average != null ? `${lastWeek.average} kg` : 'No data'}
          </span>
          {lastWeek?.count > 0 && (
            <span className="weight-comp__detail">
              Based on {lastWeek.count} weigh-in{lastWeek.count !== 1 ? 's' : ''}
            </span>
          )}
          {lastWeek?.dates?.length > 0 && (
            <span className="weight-comp__dates">{lastWeek.dates.map(fmtShort).join(', ')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// === MAIN COMPONENT ===

function OverviewTab({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weightRange, setWeightRange] = useState('3m');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/overview/${clientId}?weightRange=${weightRange}`);
      if (!res.ok) throw new Error('Failed to fetch overview');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Overview fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId, weightRange]);

  useEffect(() => {
    if (clientId) fetchOverview();
  }, [clientId, weightRange, fetchOverview]);

  if (loading) {
    return <div className="overview-loading">Loading overview...</div>;
  }

  if (error) {
    return <div className="overview-error">Failed to load overview data</div>;
  }

  if (!data) return null;

  const { scores, scoreTrend, formAnswers, previousCheckins, allFocus, focus, sleep, steps, training, nutrition, weight, weightComparison, prevWeek } = data;

  return (
    <div className="overview-tab">
      {/* Score Block Row */}
      <div className="overview-section">
        <div className="score-row">
          <div className="score-row__blocks">
            <ScoreBlock label="Overall" value={scores?.raw?.overall} trend={scoreTrend} trendKey="overall" />
            <ScoreBlock label="Training" value={scores?.raw?.training} trend={scoreTrend} trendKey="training" />
            <ScoreBlock label="Nutrition" value={scores?.raw?.nutrition} trend={scoreTrend} trendKey="nutrition" />
            <ScoreBlock label="Steps" value={scores?.raw?.steps} trend={scoreTrend} trendKey="steps" />
            <ScoreBlock label="Sleep" value={scores?.raw?.sleep} trend={scoreTrend} trendKey="sleep" />
            <ScoreBlock label="Digestion" value={scores?.raw?.digestion} trend={scoreTrend} trendKey="digestion" />
            <ScoreBlock label="Stress" value={scores?.raw?.stress} trend={scoreTrend} trendKey="stress" isStress />
          </div>
          <TotalBadge total={scores?.totalWeighted} trend={scoreTrend} />
        </div>
        {!scores && <div className="empty-state">No check-in scores available</div>}
      </div>

      {/* Check-in Form Summary */}
      {formAnswers && (
        <div className="overview-section">
          <h3 className="overview-section__title">Check-in Summary</h3>
          <div className="form-cards">
            <FormSummaryCard title="Biggest wins this week" text={formAnswers.wins} />
            <FormSummaryCard title="Stress source" text={formAnswers.stressSource} />
            <FormSummaryCard title="Where do you need help" text={formAnswers.helpNeeded} />
            <FormSummaryCard title="Upcoming events" text={formAnswers.upcomingEvents} />
          </div>
        </div>
      )}

      {/* Previous Check-ins */}
      <PreviousCheckins checkins={previousCheckins} allFocus={allFocus} clientId={clientId} />

      {/* This Week's Focus */}
      <WeeklyFocus focus={focus} clientId={clientId} />

      {/* Sleep Graph */}
      <SleepGraph data={sleep} />

      {/* Steps Graph */}
      <StepsGraph data={steps?.data} target={steps?.target} average={steps?.average} />

      {/* Training Compliance */}
      <TrainingCompliance data={training} />

      {/* Nutrition Adherence */}
      <NutritionAdherence data={nutrition} prevWeek={prevWeek} />

      {/* Weight Trajectory */}
      <WeightTrajectory
        data={weight}
        weightRange={weightRange}
        onRangeChange={setWeightRange}
        clientId={clientId}
        onSettingsChanged={fetchOverview}
      />

      {/* Weekly Average Body Weight Comparison */}
      <WeightComparison data={weightComparison} />
    </div>
  );
}

export default OverviewTab;
