import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  BarChart, ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  ScoreBlock, TotalBadge, cycleToMonday, cycleToMondayISO,
} from './shared/ScoreBlocks';
import './ClientOverviewTab.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

// ─── Helpers ────────────────────────────────────────────────────────

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

function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const daysInMonth = lastDay.getUTCDate();
  let startDow = firstDay.getUTCDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ date: null, outside: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date: dateStr, outside: false });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, outside: true });
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CAL_DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// ─── Check-in Panel field config (NON-score fields only) ───────────

const CHECKIN_PANEL_FIELDS = [
  { key: 'wins', label: 'Biggest win this week', type: 'text' },
  { key: 'daysOnPlan', label: 'Days on plan', type: 'choice' },
  { key: 'trainingIssue', label: 'Training issue', type: 'followup' },
  { key: 'stepIssue', label: 'Step issue', type: 'followup' },
  { key: 'nutritionIssue', label: 'Nutrition issue', type: 'followup' },
  { key: 'nutritionInfoVsExec', label: 'Info or execution?', type: 'followup' },
  { key: 'sleepIssue', label: 'Sleep issue', type: 'followup' },
  { key: 'digestionIssue', label: 'Digestion issue', type: 'followup' },
  { key: 'stressSource', label: 'Stress source', type: 'followup' },
  { key: 'progressDirection', label: 'Progress direction', type: 'choice' },
  { key: 'helpNeeded', label: 'Help needed', type: 'text' },
  { key: 'upcomingEvents', label: 'Upcoming', type: 'text' },
];

const BLOCK_LABELS = ['Overall', 'Training', 'Steps', 'Nutrition', 'Sleep', 'Digestion', 'Stress'];
const BLOCK_KEYS = ['overall', 'training', 'steps', 'nutrition', 'sleep', 'digestion', 'stress'];

// ─── Trajectory constants ──────────────────────────────────────────

const PHASE_LABELS = { fat_loss: 'Fat Loss', building: 'Building', recomp: 'Recomp', maintenance: 'Maintenance' };
const PHASE_COLORS = {
  fat_loss:    { stroke: 'var(--color-red)',   fill: 'rgba(239, 68, 68, 0.12)' },
  building:    { stroke: 'var(--color-green)', fill: 'rgba(34, 197, 94, 0.12)' },
  recomp:      { stroke: 'var(--color-teal)',  fill: 'rgba(35, 184, 184, 0.12)' },
  maintenance: { stroke: 'var(--color-teal)',  fill: 'rgba(35, 184, 184, 0.12)' },
};

// ─── ChartTooltip ──────────────────────────────────────────────────

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

// ─── WeeklyFocus (collapsible, in check-in panel) ──────────────────

function FocusSection({ focus, allFocus, checkinCycleStart, isCurrent, clientId, focusOpen, setFocusOpen }) {
  const [text, setText] = useState(focus?.current?.text || '');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    setText(focus?.current?.text || '');
  }, [focus]);

  const save = useCallback(async (value) => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/overview/${clientId}/focus`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, weekStart: focus?.current?.weekStart }),
      });
    } catch (err) {
      console.error('Failed to save focus:', err);
    } finally {
      setSaving(false);
    }
  }, [clientId, focus]);

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(val), 800);
  };

  // For historical check-ins, look up focus by week
  const mondayISO = cycleToMondayISO(checkinCycleStart);
  const historicalText = !isCurrent && mondayISO ? (allFocus?.[mondayISO] || '') : '';

  return (
    <div className="checkin-panel__focus">
      <button
        className="checkin-panel__focus-toggle"
        onClick={() => setFocusOpen(!focusOpen)}
      >
        <span className="checkin-panel__focus-title">
          {isCurrent ? "This Week's Focus" : "Focus for this week"}
        </span>
        <span className="checkin-panel__focus-arrow">{focusOpen ? '\u25B2' : '\u25BC'}</span>
      </button>
      {focusOpen && (
        <div className="checkin-panel__focus-body">
          {isCurrent ? (
            <>
              {focus?.previous?.text && (
                <div className="checkin-panel__focus-prev">
                  <span className="checkin-panel__focus-prev-label">Last week:</span>
                  <span className="checkin-panel__focus-prev-text">{focus.previous.text}</span>
                </div>
              )}
              <textarea
                className="checkin-panel__focus-input"
                value={text}
                onChange={handleChange}
                placeholder="Write focus points for this week..."
                rows={3}
              />
              {saving && <span className="checkin-panel__focus-saving">Saving...</span>}
            </>
          ) : (
            <div className="checkin-panel__focus-readonly">
              {historicalText || <span className="checkin-panel__focus-empty">No focus was set for this week</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CheckinPanel (left column) ────────────────────────────────────

function CheckinPanel({
  checkins, scoreTrend, allFocus, focus,
  checkinIndex, setCheckinIndex, focusOpen, setFocusOpen, clientId,
}) {
  if (!checkins || checkins.length === 0) {
    return (
      <div className="checkin-panel">
        <div className="checkin-panel__empty">No check-in data</div>
      </div>
    );
  }

  const ci = checkins[checkinIndex] || checkins[0];
  const scores = ci?.scores;
  const formAnswers = ci?.formAnswers;
  const mondayLabel = cycleToMonday(ci?.cycleStart);
  const canPrev = checkinIndex < checkins.length - 1;
  const canNext = checkinIndex > 0;

  function getFieldValue(field) {
    if (field.type === 'choice') {
      if (field.key === 'daysOnPlan') return scores?.daysOnPlan || null;
      if (field.key === 'progressDirection') return scores?.progressDirection || null;
      return null;
    }
    return formAnswers?.[field.key] || null;
  }

  return (
    <div className="checkin-panel">
      {/* Navigation */}
      <div className="checkin-panel__nav">
        <button
          className="checkin-panel__nav-btn"
          disabled={!canPrev}
          onClick={() => setCheckinIndex(i => i + 1)}
          title="Older check-in"
        >
          &#8249;
        </button>
        <span className="checkin-panel__nav-label">
          {checkinIndex === 0 ? 'Current' : mondayLabel}
        </span>
        <button
          className="checkin-panel__nav-btn"
          disabled={!canNext}
          onClick={() => setCheckinIndex(i => i - 1)}
          title="Newer check-in"
        >
          &#8250;
        </button>
      </div>

      {/* Score blocks row */}
      <div className="checkin-panel__scores">
        <div className="checkin-panel__score-blocks">
          {BLOCK_KEYS.map((key, i) => (
            <ScoreBlock
              key={key}
              label={BLOCK_LABELS[i]}
              value={scores?.raw?.[key]}
              trend={scoreTrend}
              trendKey={key}
              isStress={key === 'stress'}
            />
          ))}
        </div>
        <TotalBadge total={scores?.totalWeighted} trend={scoreTrend} />
      </div>

      {/* Focus section (collapsible) */}
      <FocusSection
        focus={focus}
        allFocus={allFocus}
        checkinCycleStart={ci?.cycleStart}
        isCurrent={checkinIndex === 0}
        clientId={clientId}
        focusOpen={focusOpen}
        setFocusOpen={setFocusOpen}
      />

      {/* Filtered Q&A list */}
      <div className="checkin-panel__fields">
        {CHECKIN_PANEL_FIELDS.map(field => {
          const value = getFieldValue(field);
          const unanswered = value == null;

          if (field.type === 'followup' && unanswered) {
            return <hr key={field.key} className="checkin-panel__skip" />;
          }

          return (
            <div key={field.key} className={`checkin-panel__field${field.type === 'followup' ? ' checkin-panel__field--followup' : ''}`}>
              <span className="checkin-panel__field-label">{field.label}</span>
              <span className="checkin-panel__field-value">{value ?? '-'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DayOverlay (modal for calendar day click) ─────────────────────

function DayOverlay({ date, dayData, clientId, onClose }) {
  const [workoutDetail, setWorkoutDetail] = useState(null);
  const [loadingWorkout, setLoadingWorkout] = useState(false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const overlayRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Fetch workout detail
  const fetchWorkout = useCallback(async (workoutId) => {
    if (selectedWorkoutId === workoutId) {
      setSelectedWorkoutId(null);
      setWorkoutDetail(null);
      return;
    }
    setLoadingWorkout(true);
    setSelectedWorkoutId(workoutId);
    try {
      const res = await fetch(`${API_BASE}/api/client-overview/${clientId}/workout/${workoutId}`);
      if (!res.ok) throw new Error('Failed to fetch workout');
      const json = await res.json();
      setWorkoutDetail(json);
    } catch (err) {
      console.error('Workout fetch error:', err);
      setWorkoutDetail(null);
    } finally {
      setLoadingWorkout(false);
    }
  }, [clientId, selectedWorkoutId]);

  if (!dayData) return null;

  const activities = dayData.activities || [];

  return (
    <>
      <div className="client-overview__overlay-backdrop" onClick={onClose} />
      <div className="client-overview__overlay" ref={overlayRef}>
        <div className="client-overview__overlay-header">
          <span className="client-overview__overlay-date">{formatDateLong(date)}</span>
          <button className="client-overview__overlay-close" onClick={onClose}>&times;</button>
        </div>

        {/* Activities list */}
        {activities.length > 0 && (
          <div className="client-overview__overlay-activities">
            {activities.map((a, ai) => {
              const isStrength = a.type === 'strength';
              const wId = a.workoutId || a.id;
              const isSelected = isStrength && selectedWorkoutId === wId;
              return (
                <div key={ai} className="client-overview__overlay-activity">
                  <div
                    className={`client-overview__overlay-activity-row${isStrength ? ' client-overview__overlay-activity-row--clickable' : ''}`}
                    onClick={isStrength && wId ? () => fetchWorkout(wId) : undefined}
                  >
                    <span className={`client-overview__overlay-dot client-overview__overlay-dot--${a.type}`} />
                    <span className="client-overview__overlay-name">{a.name}</span>
                    {a.duration && <span className="client-overview__overlay-meta">{a.duration}</span>}
                    {a.distance && <span className="client-overview__overlay-meta">{a.distance}</span>}
                    {isStrength && wId && (
                      <span className="client-overview__overlay-expand">{isSelected ? '\u25B2' : '\u25BC'}</span>
                    )}
                  </div>
                  {isSelected && loadingWorkout && (
                    <div className="client-overview__overlay-workout-loading">Loading exercises...</div>
                  )}
                  {isSelected && workoutDetail && !loadingWorkout && (
                    <div className="client-overview__overlay-workout">
                      <table className="client-overview__overlay-table">
                        <thead>
                          <tr>
                            <th>Exercise</th>
                            <th>Set</th>
                            <th>Weight</th>
                            <th>Reps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(workoutDetail.exercises || []).flatMap((ex, ei) => {
                            const sets = ex.sets && ex.sets.length > 0 ? ex.sets : [{ reps: null, weight: null }];
                            return sets.map((s, si) => (
                              <tr key={`${ei}-${si}`} className={si === 0 ? 'client-overview__overlay-table-first' : ''}>
                                <td>{si === 0 ? ex.name : ''}</td>
                                <td>{sets.length > 1 ? si + 1 : '-'}</td>
                                <td>{s.weight != null ? `${s.weight} kg` : '-'}</td>
                                <td>{s.reps != null ? s.reps : '-'}</td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Day stats */}
        <div className="client-overview__overlay-stats">
          {dayData.weight && (
            <div className="client-overview__overlay-stat">
              <span className="client-overview__overlay-stat-label">Weight</span>
              <span className="client-overview__overlay-stat-value">{dayData.weight} kg</span>
            </div>
          )}
          {dayData.calories != null && dayData.calories > 0 && (
            <div className="client-overview__overlay-stat">
              <span className="client-overview__overlay-stat-label">Calories</span>
              <span className="client-overview__overlay-stat-value">{dayData.calories.toLocaleString()} kcal</span>
            </div>
          )}
          {dayData.protein != null && dayData.protein > 0 && (
            <div className="client-overview__overlay-stat">
              <span className="client-overview__overlay-stat-label">Protein</span>
              <span className="client-overview__overlay-stat-value">{dayData.protein}g</span>
            </div>
          )}
          {dayData.sleep != null && (
            <div className="client-overview__overlay-stat">
              <span className="client-overview__overlay-stat-label">Sleep</span>
              <span className="client-overview__overlay-stat-value">{dayData.sleep}h</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── CalendarPanel (right column) ──────────────────────────────────

function CalendarPanel({ calendar, calendarMonth, calendarYear, setCalendarMonth, setCalendarYear, selectedDay, setSelectedDay, clientId }) {
  const todayStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
  }, []);

  const dayDataMap = useMemo(() => {
    const map = {};
    if (calendar?.days) {
      for (const day of calendar.days) {
        map[day.date] = day;
      }
    }
    return map;
  }, [calendar?.days]);

  const weeks = useMemo(() => buildMonthGrid(calendarYear, calendarMonth), [calendarYear, calendarMonth]);

  const goToPrevMonth = useCallback(() => {
    setSelectedDay(null);
    if (calendarMonth === 1) {
      setCalendarYear(y => y - 1);
      setCalendarMonth(12);
    } else {
      setCalendarMonth(m => m - 1);
    }
  }, [calendarMonth, setCalendarMonth, setCalendarYear, setSelectedDay]);

  const goToNextMonth = useCallback(() => {
    setSelectedDay(null);
    if (calendarMonth === 12) {
      setCalendarYear(y => y + 1);
      setCalendarMonth(1);
    } else {
      setCalendarMonth(m => m + 1);
    }
  }, [calendarMonth, setCalendarMonth, setCalendarYear, setSelectedDay]);

  const handleDayClick = useCallback((dateStr) => {
    const dayData = dayDataMap[dateStr];
    if (!dayData) return;
    const hasContent = (dayData.activities || []).length > 0 || dayData.bodyStatsLogged || dayData.weight || dayData.calories || dayData.sleep;
    if (!hasContent) return;
    setSelectedDay(dateStr);
  }, [dayDataMap, setSelectedDay]);

  return (
    <div className="cal-panel">
      {/* Month navigation */}
      <div className="cal-panel__nav">
        <button className="cal-panel__nav-btn" onClick={goToPrevMonth} title="Previous month">&#8249;</button>
        <span className="cal-panel__nav-label">{MONTH_NAMES[calendarMonth - 1]} {calendarYear}</span>
        <button className="cal-panel__nav-btn" onClick={goToNextMonth} title="Next month">&#8250;</button>
      </div>

      {/* Day headers */}
      <div className="cal-panel__header">
        {CAL_DAY_NAMES.map((name, i) => (
          <div key={i} className="cal-panel__header-cell">{name}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="cal-panel__grid">
        {weeks.flat().map((cell, i) => {
          if (cell.outside) {
            return <div key={i} className="cal-panel__cell cal-panel__cell--outside" />;
          }

          const dayData = dayDataMap[cell.date];
          const activities = dayData?.activities || [];
          const isToday = cell.date === todayStr;
          const dayNum = parseInt(cell.date.split('-')[2]);
          const hasContent = activities.length > 0 || dayData?.bodyStatsLogged || dayData?.weight || dayData?.calories || dayData?.sleep;

          // Categorize activities
          const strengthSessions = activities.filter(a => a.type === 'strength');
          const cardioSessions = activities.filter(a => a.type === 'cardio' || a.type === 'walking');
          const hasNutrition = dayData?.calories > 0;
          const sleepHours = dayData?.sleep;

          return (
            <div
              key={i}
              className={`cal-panel__cell${isToday ? ' cal-panel__cell--today' : ''}${hasContent ? ' cal-panel__cell--clickable' : ''}${selectedDay === cell.date ? ' cal-panel__cell--selected' : ''}`}
              onClick={hasContent ? () => handleDayClick(cell.date) : undefined}
            >
              <span className="cal-panel__date">{dayNum}</span>
              {/* Workout names */}
              {strengthSessions.map((s, si) => (
                <span key={`s${si}`} className="cal-panel__activity cal-panel__activity--strength">{s.name || 'Strength'}</span>
              ))}
              {cardioSessions.map((c, ci) => (
                <span key={`c${ci}`} className="cal-panel__activity cal-panel__activity--cardio">{c.name || 'Cardio'}</span>
              ))}
              {/* Body stats (weight) */}
              {dayData?.weight && (
                <span className="cal-panel__stat cal-panel__stat--weight">{dayData.weight} kg</span>
              )}
              {/* Nutrition */}
              {hasNutrition && (
                <span className="cal-panel__stat cal-panel__stat--nutrition">
                  {dayData.calories.toLocaleString()} kcal
                  {dayData.protein > 0 && <span className="cal-panel__protein"> {dayData.protein}g P</span>}
                </span>
              )}
              {/* Sleep */}
              {sleepHours != null && (
                <span className="cal-panel__stat cal-panel__stat--sleep">{sleepHours}h sleep</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Day overlay */}
      {selectedDay && dayDataMap[selectedDay] && (
        <DayOverlay
          date={selectedDay}
          dayData={dayDataMap[selectedDay]}
          clientId={clientId}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

// ─── StepsGraph ────────────────────────────────────────────────────

function StepsGraph({ data, target, average }) {
  if (!data || data.length === 0) {
    return (
      <div className="client-overview__chart-section">
        <h3 className="client-overview__chart-title">Steps <span className="data-source">Trainerize</span></h3>
        <div className="client-overview__empty">No step data available</div>
      </div>
    );
  }

  return (
    <div className="client-overview__chart-section">
      <h3 className="client-overview__chart-title">
        Steps - Last 10 Days <span className="data-source">Trainerize</span>
        {average != null && (
          <span className="client-overview__chart-subtitle">Avg: {average.toLocaleString()}</span>
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
                active={active} payload={payload}
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
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36} fill="var(--color-teal)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SleepGraph (with hours/times toggle) ──────────────────────────

function SleepGraph({ data, sleepMode, setSleepMode }) {
  if (!data || data.length === 0) {
    return (
      <div className="client-overview__chart-section">
        <h3 className="client-overview__chart-title">Sleep <span className="data-source">Trainerize</span></h3>
        <div className="client-overview__empty">No sleep data available</div>
      </div>
    );
  }

  const hasTimes = data.some(d => d.bedtime || d.wakeTime);

  return (
    <div className="client-overview__chart-section">
      <div className="client-overview__chart-header">
        <h3 className="client-overview__chart-title">Sleep - Last 10 Days <span className="data-source">Trainerize</span></h3>
        {hasTimes && (
          <div className="client-overview__toggle-group">
            <button
              className={`client-overview__toggle-btn${sleepMode === 'hours' ? ' client-overview__toggle-btn--active' : ''}`}
              onClick={() => setSleepMode('hours')}
            >
              Hours
            </button>
            <button
              className={`client-overview__toggle-btn${sleepMode === 'times' ? ' client-overview__toggle-btn--active' : ''}`}
              onClick={() => setSleepMode('times')}
            >
              Times
            </button>
          </div>
        )}
      </div>

      {sleepMode === 'hours' ? (
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
                  active={active} payload={payload}
                  labelFormatter={(p) => fmtDayShort(p.date)}
                  valueFormatter={(v) => `${v.toFixed(1)}`}
                  valueSuffix=" hrs"
                />
              )}
            />
            <Bar dataKey="hours" fill="var(--color-teal)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="client-overview__sleep-times">
          {data.filter(d => d.bedtime || d.wakeTime).map((d, i) => (
            <div key={i} className="client-overview__sleep-time-entry">
              <span className="client-overview__sleep-time-day">{fmtDay(d.date)}</span>
              <div className="client-overview__sleep-time-bar">
                <span className="client-overview__sleep-time-bed">{d.bedtime || '-'}</span>
                <span className="client-overview__sleep-time-line" />
                <span className="client-overview__sleep-time-wake">{d.wakeTime || '-'}</span>
              </div>
              {d.hours != null && (
                <span className="client-overview__sleep-time-hrs">{d.hours.toFixed(1)}h</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Strength Sessions (4-week bar blocks) ─────────────────────────

function StrengthSessionsSection({ data }) {
  const weeks = data?.strengthWeekly || [];
  const maxCount = Math.max(...weeks.map(w => w.count), 1);

  return (
    <div className="client-overview__chart-section">
      <h3 className="client-overview__chart-title">Strength Sessions</h3>
      {weeks.length === 0 ? (
        <div className="client-overview__empty">No strength data</div>
      ) : (
        <div className="strength-weeks">
          {weeks.map((w, i) => {
            const pct = (w.count / maxCount) * 100;
            const label = i === weeks.length - 1
              ? 'This wk'
              : `${weeks.length - 1 - i} wk ago`;
            return (
              <div key={w.weekStart} className="strength-weeks__block">
                <div className="strength-weeks__bar-track">
                  <div
                    className="strength-weeks__bar-fill"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="strength-weeks__count">{w.count}</span>
                <span className="strength-weeks__label">{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Cardio Sessions (last 2 weeks list) ────────────────────────────

function CardioSessionsSection({ data }) {
  const raw = data?.cardioSessions;
  const sessions = Array.isArray(raw) ? raw : [];

  const fmtDuration = (sec) => {
    if (!sec) return null;
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  };

  const fmtDist = (d) => {
    if (!d) return null;
    return d >= 1 ? `${d.toFixed(1)} km` : `${Math.round(d * 1000)} m`;
  };

  return (
    <div className="client-overview__chart-section">
      <h3 className="client-overview__chart-title">Cardio Sessions</h3>
      {sessions.length === 0 ? (
        <div className="client-overview__empty">No cardio data</div>
      ) : (
        <div className="cardio-list">
          {sessions.map((s, i) => {
            const dur = fmtDuration(s.durationSeconds);
            const dist = fmtDist(s.distance);
            const meta = [dur, dist].filter(Boolean).join(' / ');
            return (
              <div key={i} className="cardio-list__row">
                <div className="cardio-list__info">
                  <span className="cardio-list__name">{s.name || 'Cardio'}</span>
                  {meta && <span className="cardio-list__meta">{meta}</span>}
                </div>
                <span className="cardio-list__date">{fmtShort(s.date)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── TrajectorySettingsPanel ───────────────────────────────────────

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

// ─── WeightTrajectory ──────────────────────────────────────────────

function WeightTrajectorySection({ data, onRangeChange, weightRange, clientId, onSettingsChanged }) {
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

  const yValues = chartData.flatMap(d => [d.weight, d.bandMin, d.bandMax].filter(v => v != null));
  const yDomain = yValues.length > 0
    ? [Math.floor(Math.min(...yValues) - 1), Math.ceil(Math.max(...yValues) + 1)]
    : ['auto', 'auto'];

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
    <div className="client-overview__chart-section">
      <div className="client-overview__chart-header">
        <h3 className="client-overview__chart-title">
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
        <div className="client-overview__empty">No weight data available</div>
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
                      active={active} payload={weightPayload}
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
                stroke="var(--color-teal)" strokeWidth={2}
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

// ─── WeightComparison (3 weeks) ────────────────────────────────────

function WeightComparisonSection({ data }) {
  if (!data) return null;

  // Support 3 weeks: threeWeeksAgo, previousWeek (or twoWeeksAgo), lastWeek
  const weeks = [];
  if (data.threeWeeksAgo) {
    weeks.push({ label: '3 weeks ago', ...data.threeWeeksAgo });
  }
  if (data.previousWeek) {
    weeks.push({ label: 'Previous week', ...data.previousWeek });
  }
  if (data.lastWeek) {
    weeks.push({ label: 'Last week', ...data.lastWeek });
  }

  // Fallback if API still returns old 2-week shape
  if (weeks.length === 0) {
    const { lastWeek, previousWeek, delta } = data;
    const deltaColor = delta == null ? 'var(--color-slate)'
      : delta > 0 ? 'var(--color-amber)'
      : delta < 0 ? 'var(--color-green)'
      : 'var(--color-slate)';
    const deltaSign = delta > 0 ? '+' : '';

    return (
      <div className="client-overview__chart-section">
        <h3 className="client-overview__chart-title">Weekly Average Body Weight</h3>
        <div className="client-overview__weight-comp">
          <div className="client-overview__weight-comp-box">
            <span className="client-overview__weight-comp-label">Previous Week</span>
            <span className="client-overview__weight-comp-avg">
              {previousWeek?.average != null ? `${previousWeek.average} kg` : 'No data'}
            </span>
            {previousWeek?.count > 0 && (
              <span className="client-overview__weight-comp-detail">
                {previousWeek.count} day{previousWeek.count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="client-overview__weight-comp-delta" style={{ color: deltaColor }}>
            {delta != null ? `${deltaSign}${delta} kg` : '-'}
          </div>
          <div className="client-overview__weight-comp-box">
            <span className="client-overview__weight-comp-label">Last Week</span>
            <span className="client-overview__weight-comp-avg">
              {lastWeek?.average != null ? `${lastWeek.average} kg` : 'No data'}
            </span>
            {lastWeek?.count > 0 && (
              <span className="client-overview__weight-comp-detail">
                {lastWeek.count} day{lastWeek.count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3-week layout
  return (
    <div className="client-overview__chart-section">
      <h3 className="client-overview__chart-title">Weekly Average Body Weight</h3>
      <div className="client-overview__weight-comp client-overview__weight-comp--three">
        {weeks.map((w, i) => {
          // Delta between consecutive weeks
          let delta = null;
          let deltaColor = 'var(--color-slate)';
          if (i > 0 && weeks[i - 1].average != null && w.average != null) {
            delta = Number((w.average - weeks[i - 1].average).toFixed(1));
            deltaColor = delta > 0 ? 'var(--color-amber)' : delta < 0 ? 'var(--color-green)' : 'var(--color-slate)';
          }
          const deltaSign = delta != null && delta > 0 ? '+' : '';

          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className="client-overview__weight-comp-delta" style={{ color: deltaColor }}>
                  {delta != null ? `${deltaSign}${delta} kg` : '-'}
                </div>
              )}
              <div className="client-overview__weight-comp-box">
                <span className="client-overview__weight-comp-label">{w.label}</span>
                <span className="client-overview__weight-comp-avg">
                  {w.average != null ? `${w.average} kg` : 'No data'}
                </span>
                {w.count > 0 && (
                  <span className="client-overview__weight-comp-detail">
                    {w.count} day{w.count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

function ClientOverviewTab({ clientId }) {
  // --- Section-level state ---
  const [summaryData, setSummaryData] = useState(null);   // { checkins, scoreTrend, allFocus, focus, weightComparison }
  const [calendarData, setCalendarData] = useState(null);  // { days: [...] }
  const [complianceData, setComplianceData] = useState(null); // { weightSessions, cardioSessions }
  const [weightData, setWeightData] = useState(null);      // { entries, trajectory }
  const [healthData, setHealthData] = useState(null);      // { sleep, steps }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkinIndex, setCheckinIndex] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return parseInt(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin', month: 'numeric' }));
  });
  const [calendarYear, setCalendarYear] = useState(() => {
    const now = new Date();
    return parseInt(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric' }));
  });
  const [weightRange, setWeightRange] = useState('3m');
  const [focusOpen, setFocusOpen] = useState(false);
  const complianceRange = 30; // fixed - backend handles its own date ranges
  const [sleepMode, setSleepMode] = useState('hours');
  const [selectedDay, setSelectedDay] = useState(null);

  // Track which clientId we have data for, to distinguish initial load from param changes
  const loadedClientRef = useRef(null);

  // --- Individual fetch functions ---

  const fetchSummary = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch(`${API_BASE}/api/client-overview/${clientId}/summary`);
      if (!res.ok) throw new Error('Failed to fetch summary');
      const json = await res.json();
      setSummaryData(json);
    } catch (err) {
      console.error('Summary fetch error:', err);
      throw err;
    }
  }, [clientId]);

  const fetchCalendar = useCallback(async () => {
    if (!clientId) return;
    try {
      const monthStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}`;
      const res = await fetch(`${API_BASE}/api/client-overview/${clientId}/calendar?month=${monthStr}`);
      if (!res.ok) throw new Error('Failed to fetch calendar');
      const json = await res.json();
      setCalendarData(json);
    } catch (err) {
      console.error('Calendar fetch error:', err);
    }
  }, [clientId, calendarYear, calendarMonth]);

  const fetchCompliance = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch(`${API_BASE}/api/client-overview/${clientId}/compliance?range=${complianceRange}`);
      if (!res.ok) throw new Error('Failed to fetch compliance');
      const json = await res.json();
      setComplianceData(json);
    } catch (err) {
      console.error('Compliance fetch error:', err);
    }
  }, [clientId, complianceRange]);

  const fetchWeight = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch(`${API_BASE}/api/client-overview/${clientId}/weight?range=${weightRange}`);
      if (!res.ok) throw new Error('Failed to fetch weight');
      const json = await res.json();
      setWeightData(json);
    } catch (err) {
      console.error('Weight fetch error:', err);
    }
  }, [clientId, weightRange]);

  const fetchHealth = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch(`${API_BASE}/api/client-overview/${clientId}/health`);
      if (!res.ok) throw new Error('Failed to fetch health');
      const json = await res.json();
      setHealthData(json);
    } catch (err) {
      console.error('Health fetch error:', err);
    }
  }, [clientId]);

  // --- Initial load: when clientId changes, fetch everything and show loading ---
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const loadAll = async () => {
      setLoading(true);
      setError(null);
      loadedClientRef.current = null;

      try {
        await Promise.all([
          fetchSummary(),
          fetchCalendar(),
          fetchCompliance(),
          fetchWeight(),
          fetchHealth(),
        ]);
        if (!cancelled) {
          loadedClientRef.current = clientId;
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAll();
    return () => { cancelled = true; };
    // Only re-run when clientId changes - individual param effects handle the rest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // --- Parameter-only effects: silently re-fetch individual sections ---

  useEffect(() => {
    if (loadedClientRef.current === clientId) fetchCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarYear, calendarMonth]);

  useEffect(() => {
    if (loadedClientRef.current === clientId) fetchWeight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightRange]);

  // Reset check-in index when checkins change
  useEffect(() => {
    setCheckinIndex(0);
  }, [summaryData?.checkins?.length]);

  // --- Render ---

  if (loading) {
    return <div className="client-overview__loading">Loading overview...</div>;
  }

  if (error) {
    return <div className="client-overview__error">Failed to load overview data</div>;
  }

  if (!summaryData) return null;

  return (
    <div className="client-overview">
      {/* Two-column layout: check-in left, calendar right */}
      <div className="client-overview__columns">
        <div className="client-overview__left">
          <CheckinPanel
            checkins={summaryData.checkins}
            scoreTrend={summaryData.scoreTrend}
            allFocus={summaryData.allFocus}
            focus={summaryData.focus}
            checkinIndex={checkinIndex}
            setCheckinIndex={setCheckinIndex}
            focusOpen={focusOpen}
            setFocusOpen={setFocusOpen}
            clientId={clientId}
          />
        </div>
        <div className="client-overview__right">
          <CalendarPanel
            calendar={calendarData}
            calendarMonth={calendarMonth}
            calendarYear={calendarYear}
            setCalendarMonth={setCalendarMonth}
            setCalendarYear={setCalendarYear}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            clientId={clientId}
          />
        </div>
      </div>

      {/* Charts below calendar */}
      <div className="client-overview__charts">
        {/* Row 1: Steps + Sleep side by side */}
        <div className="client-overview__chart-row">
          <StepsGraph
            data={healthData?.steps?.data}
            target={healthData?.steps?.target}
            average={healthData?.steps?.average}
          />
          <SleepGraph
            data={healthData?.sleep}
            sleepMode={sleepMode}
            setSleepMode={setSleepMode}
          />
        </div>

        {/* Row 2: Strength + Cardio side by side */}
        <div className="client-overview__chart-row">
          <StrengthSessionsSection data={complianceData} />
          <CardioSessionsSection data={complianceData} />
        </div>

        {/* Row 3: Weight trajectory full width */}
        <WeightTrajectorySection
          data={weightData}
          weightRange={weightRange}
          onRangeChange={setWeightRange}
          clientId={clientId}
          onSettingsChanged={fetchWeight}
        />

        <WeightComparisonSection data={summaryData.weightComparison} />
      </div>
    </div>
  );
}

export default ClientOverviewTab;
