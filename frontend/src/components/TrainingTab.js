import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import './TrainingTab.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

// --- Helpers ---

function fmtDayName(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { weekday: 'short', timeZone: 'UTC' });
}

function fmtDayNum(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { day: 'numeric', timeZone: 'UTC' });
}

function fmtShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function fmtDateCompact(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function getWeekLabel(mondayStr) {
  if (!mondayStr) return '';
  const mon = new Date(mondayStr + 'T00:00:00Z');
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmtD = (d) => d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmtD(mon)} - ${fmtD(sun)}`;
}

function liftProgressColor(pct) {
  if (pct == null) return 'var(--color-slate)';
  if (pct >= 90) return 'var(--color-green)';
  if (pct >= 70) return 'var(--color-amber)';
  if (pct >= 40) return 'var(--color-teal)';
  return 'var(--color-slate)';
}

const TARGET_TYPE_LABELS = {
  '1rm': '1 Rep Max',
  '5rm': '5 Rep Max',
  '10rm': '10 Rep Max',
  'max_reps': 'Max Reps (bodyweight)',
  'max_time': 'Max Time',
};

// Group calendar days into weeks (Mon-Sun)
function groupIntoWeeks(calendarDays, startDate, endDate) {
  const dayMap = {};
  for (const day of calendarDays) {
    dayMap[day.date] = day.sessions;
  }

  const allDates = [];
  const d = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (d <= end) {
    allDates.push(d.toISOString().split('T')[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const weeks = [];
  let currentWeek = [];
  for (const date of allDates) {
    currentWeek.push({ date, sessions: dayMap[date] || [] });
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    if (dow === 0 || date === endDate) {
      if (currentWeek.length > 0) {
        weeks.push({ monday: currentWeek[0].date, days: currentWeek });
        currentWeek = [];
      }
    }
  }
  if (currentWeek.length > 0) {
    weeks.push({ monday: currentWeek[0].date, days: currentWeek });
  }
  return weeks;
}

// =====================
// SESSION CALENDAR
// =====================

function SessionCalendar({ data, range }) {
  if (!range) return null;
  const weeks = groupIntoWeeks(data || [], range.start, range.end);
  const todayStr = range.todayStr;

  return (
    <div className="training-section">
      <h3 className="training-section__title">
        Session Calendar
        <span className="data-source">Trainerize</span>
      </h3>
      {weeks.length === 0 ? (
        <div className="empty-state">No calendar data available</div>
      ) : (
        <div className="session-calendar">
          {weeks.map((week, wi) => (
            <div key={wi} className="session-calendar__week">
              <div className="session-calendar__week-label">
                {getWeekLabel(week.monday)}
                {week.monday === range.thisMonday && (
                  <span className="session-calendar__current-badge">Current week</span>
                )}
              </div>
              <div className="session-calendar__days">
                {week.days.map((day, di) => {
                  const isToday = day.date === todayStr;
                  return (
                    <div
                      key={di}
                      className={`session-calendar__day${isToday ? ' session-calendar__day--today' : ''}`}
                    >
                      <div className="session-calendar__day-header">
                        <span className="session-calendar__day-name">{fmtDayName(day.date)}</span>
                        <span className="session-calendar__day-num">{fmtDayNum(day.date)}</span>
                      </div>
                      <div className="session-calendar__sessions">
                        {day.sessions.map((s, si) => (
                          <div
                            key={si}
                            className={`session-calendar__session session-calendar__session--${s.category} ${s.completed ? 'session-calendar__session--filled' : ''}`}
                          >
                            <span className="session-calendar__session-name">{s.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================
// KEY LIFTS TRACKER
// =====================

function KeyLiftsTracker({ clientId }) {
  const [lifts, setLifts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ exerciseName: '', exerciseId: null, targetType: '5rm', targetWeight: '' });
  const [saving, setSaving] = useState(false);
  const [exercisesLoading, setExercisesLoading] = useState(false);

  const fetchLifts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/training/${clientId}/key-lifts`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setLifts(json.lifts || []);
    } catch (err) {
      console.error('Key lifts fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const fetchExercises = useCallback(async () => {
    setExercisesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/training/${clientId}/exercises`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setExercises(json.exercises || []);
    } catch (err) {
      console.error('Exercises fetch error:', err);
    } finally {
      setExercisesLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchLifts(); }, [fetchLifts]);

  const handleOpenAdd = () => {
    setShowAdd(true);
    if (exercises.length === 0) fetchExercises();
  };

  const handleAdd = async () => {
    if (!addForm.exerciseName || !addForm.targetWeight) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/training/${clientId}/key-lifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseName: addForm.exerciseName,
          exerciseId: addForm.exerciseId,
          targetType: addForm.targetType,
          targetWeight: Number(addForm.targetWeight),
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setAddForm({ exerciseName: '', exerciseId: null, targetType: '5rm', targetWeight: '' });
        fetchLifts();
      }
    } catch (err) {
      console.error('Add lift error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (liftId) => {
    try {
      await fetch(`${API_BASE}/api/training/${clientId}/key-lifts/${liftId}`, { method: 'DELETE' });
      fetchLifts();
    } catch (err) {
      console.error('Delete lift error:', err);
    }
  };

  const handleExerciseSelect = (e) => {
    const name = e.target.value;
    const ex = exercises.find(x => x.name === name);
    setAddForm(f => ({ ...f, exerciseName: name, exerciseId: ex?.id || null }));
  };

  return (
    <div className="training-section">
      <div className="training-section__header">
        <h3 className="training-section__title" style={{ marginBottom: 0 }}>
          Key Lifts Tracker
          <span className="data-source">Trainerize</span>
        </h3>
        <button className="key-lifts__add-btn" onClick={handleOpenAdd}>+ Add lift</button>
      </div>

      {loading ? (
        <div className="empty-state">Loading key lifts...</div>
      ) : lifts.length === 0 && !showAdd ? (
        <div className="empty-state">No key lifts set for this client. Click "Add lift" to start tracking.</div>
      ) : (
        <div className="key-lifts__list">
          {lifts.map(lift => (
            <div key={lift.id} className="key-lifts__card">
              <div className="key-lifts__card-header">
                <div className="key-lifts__card-info">
                  <span className="key-lifts__exercise-name">{lift.exercise_name}</span>
                  <span className="key-lifts__target-type">{TARGET_TYPE_LABELS[lift.target_type] || lift.target_type}</span>
                </div>
                <button className="key-lifts__delete-btn" onClick={() => handleDelete(lift.id)} title="Remove lift">x</button>
              </div>
              <div className="key-lifts__stats">
                <div className="key-lifts__stat">
                  <span className="key-lifts__stat-label">Current best</span>
                  <span className="key-lifts__stat-value">
                    {lift.bestDisplay || 'No data'}
                  </span>
                  {lift.bestDate && <span className="key-lifts__stat-date">{fmtShort(lift.bestDate)}</span>}
                </div>
                <div className="key-lifts__stat">
                  <span className="key-lifts__stat-label">Target</span>
                  <span className="key-lifts__stat-value">{lift.targetDisplay}</span>
                </div>
                <div className="key-lifts__stat">
                  <span className="key-lifts__stat-label">Progress</span>
                  <span className="key-lifts__stat-value" style={{ color: liftProgressColor(lift.progress) }}>
                    {lift.progress != null ? `${lift.progress}%` : '-'}
                  </span>
                </div>
              </div>
              {lift.progress != null && (
                <div className="key-lifts__progress-bar">
                  <div
                    className="key-lifts__progress-fill"
                    style={{
                      width: `${Math.min(lift.progress, 100)}%`,
                      backgroundColor: liftProgressColor(lift.progress),
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="key-lifts__add-form">
          <div className="key-lifts__add-row">
            <div className="key-lifts__add-field">
              <label>Exercise</label>
              {exercisesLoading ? (
                <span className="key-lifts__loading-text">Loading exercises...</span>
              ) : (
                <select value={addForm.exerciseName} onChange={handleExerciseSelect}>
                  <option value="">Select exercise</option>
                  {exercises.map(ex => (
                    <option key={ex.id} value={ex.name}>{ex.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="key-lifts__add-field">
              <label>Target type</label>
              <select value={addForm.targetType} onChange={e => setAddForm(f => ({ ...f, targetType: e.target.value }))}>
                <option value="1rm">1 Rep Max</option>
                <option value="5rm">5 Rep Max</option>
                <option value="10rm">10 Rep Max</option>
                <option value="max_reps">Max Reps (bodyweight)</option>
                <option value="max_time">Max Time (seconds)</option>
              </select>
            </div>
            <div className="key-lifts__add-field">
              <label>
                {addForm.targetType === 'max_reps' ? 'Target reps'
                  : addForm.targetType === 'max_time' ? 'Target time (seconds)'
                  : 'Target weight (kg)'}
              </label>
              <input
                type="number"
                value={addForm.targetWeight}
                onChange={e => setAddForm(f => ({ ...f, targetWeight: e.target.value }))}
                placeholder={
                  addForm.targetType === 'max_reps' ? 'e.g. 20'
                  : addForm.targetType === 'max_time' ? 'e.g. 60'
                  : 'e.g. 100'
                }
              />
            </div>
          </div>
          <div className="key-lifts__add-actions">
            <button className="key-lifts__save-btn" onClick={handleAdd} disabled={saving || !addForm.exerciseName || !addForm.targetWeight}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="key-lifts__cancel-btn" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================
// BLOCK PROGRESS
// =====================

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

const COLOR_CLASS = {
  white: 'block-cell--white',
  green: 'block-cell--green',
  amber: 'block-cell--amber',
  red: 'block-cell--red',
  empty: 'block-cell--empty',
};

function formatSet(reps, weight, time) {
  if (time != null && time > 0 && reps == null && weight == null) {
    const m = Math.floor(time / 60);
    const s = Math.round(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (reps == null && weight == null) return '-';
  if (weight == null || weight === 0) return reps != null ? `${reps} reps` : '-';
  if (reps == null) return `${weight}kg`;
  return `${reps} x ${weight}kg`;
}

function ArrowIndicator({ arrow }) {
  if (!arrow) return null;
  if (arrow === 'up') return <span className="block-arrow block-arrow--up">{'\u25B2'}</span>;
  if (arrow === 'down') return <span className="block-arrow block-arrow--down">{'\u25BC'}</span>;
  return <span className="block-arrow block-arrow--same">{'\u25B6'}</span>;
}

function BlockProgress({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('volume');
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  const fetchBlock = useCallback(async (planId) => {
    setLoading(true);
    try {
      const url = planId
        ? `${API_BASE}/api/training/${clientId}/block-progress?planId=${planId}`
        : `${API_BASE}/api/training/${clientId}/block-progress`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      if (json.plan?.id && !planId) setSelectedPlanId(json.plan.id);
    } catch (err) {
      console.error('Block progress fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchBlock(selectedPlanId); }, [fetchBlock, selectedPlanId]);

  const handlePlanChange = (e) => {
    const id = Number(e.target.value);
    setSelectedPlanId(id);
  };

  const handleToggleFlag = async (cId, workoutId, exerciseName, setNum, flagged) => {
    try {
      await fetch(`${API_BASE}/api/training/${cId}/data-flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutId, exerciseName, setNum, flagged }),
      });
      fetchBlock(selectedPlanId);
    } catch (err) {
      console.error('Toggle flag error:', err);
    }
  };

  if (loading) {
    return (
      <div className="training-section">
        <h3 className="training-section__title">Training Block Progress</h3>
        <div className="empty-state">Loading block progress...</div>
      </div>
    );
  }

  const workoutNames = data?.workoutNames || [];
  const workouts = data?.workouts || {};
  const plans = data?.plans || [];
  const currentPlan = data?.plan;

  return (
    <div className="training-section">
      <div className="training-section__header">
        <h3 className="training-section__title" style={{ marginBottom: 0 }}>
          Training Block Progress
          <span className="data-source">Trainerize</span>
        </h3>
        <div className="block-progress__controls">
          <div className="block-progress__metric-toggle">
            <button
              className={`block-progress__metric-btn${metric === 'volume' ? ' block-progress__metric-btn--active' : ''}`}
              onClick={() => setMetric('volume')}
            >
              Total Volume
            </button>
            <button
              className={`block-progress__metric-btn${metric === 'maxWeight' ? ' block-progress__metric-btn--active' : ''}`}
              onClick={() => setMetric('maxWeight')}
            >
              Max Weight
            </button>
          </div>
          {plans.length > 0 && (
            <select
              className="block-progress__plan-select"
              value={currentPlan?.id || ''}
              onChange={handlePlanChange}
            >
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({fmtShort(p.startDate)} - {fmtShort(p.endDate)})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {workoutNames.length === 0 ? (
        <div className="empty-state">No completed sessions in this program</div>
      ) : (
        workoutNames.map(name => {
          const wd = workouts[name];
          if (!wd) return null;

          const { exerciseRows, indicatorRows, sessions, trendData } = wd;
          const colorKey = metric === 'volume' ? 'volumeColor' : 'maxWeightColor';

          return (
            <div key={name} className="block-workout">
              <h4 className="block-workout__name">{name}</h4>

              <div className="block-scroll-wrapper">
                {/* Fixed left column */}
                <div className="block-fixed-col">
                  <div className="block-fixed-col__corner" />

                  {exerciseRows.map((row, ri) => (
                    <React.Fragment key={ri}>
                      <div className="block-fixed-col__exercise">{row.exercise}</div>
                      {row.setRows.map((sr, si) => (
                        <div key={`${ri}-s-${si}`} className="block-fixed-col__set">Set {sr.setNum}</div>
                      ))}
                    </React.Fragment>
                  ))}

                  {indicatorRows && indicatorRows.map((ind, ii) => (
                    <div key={`ind-${ii}`} className="block-fixed-col__indicator">{ind.name}</div>
                  ))}

                  <div className="block-fixed-col__total">Total Volume</div>
                </div>

                {/* Scrollable session columns */}
                <div className="block-scroll-area">
                  <div className="block-scroll-inner" style={{ '--session-count': sessions.length }}>
                    {/* Header row */}
                    {sessions.map((s, i) => (
                      <div key={i} className="block-col-header">
                        <span className="block-col-header__num">S{s.sessionNum}</span>
                        <span className="block-col-header__date">{fmtDateCompact(s.date)}</span>
                      </div>
                    ))}

                    {/* Exercise rows */}
                    {exerciseRows.map((row, ri) => (
                      <React.Fragment key={ri}>
                        {/* Exercise header cells */}
                        {row.colors.map((c, ci) => {
                          const color = c[colorKey] || 'empty';
                          return (
                            <div key={`eh-${ri}-${ci}`} className={`block-cell block-cell--exercise-header ${COLOR_CLASS[color]}`} />
                          );
                        })}

                        {/* Set sub-rows */}
                        {row.setRows.map((sr, si) => (
                          <React.Fragment key={`${ri}-set-${si}`}>
                            {sr.cells.map((cell, ci) => {
                              const exColor = cell.flagged ? 'empty' : (row.colors[ci]?.[colorKey] || 'empty');
                              const sessionData = sessions[ci];
                              return (
                                <div
                                  key={`sc-${ri}-${si}-${ci}`}
                                  className={`block-cell block-cell--set ${COLOR_CLASS[exColor]}${cell.flagged ? ' block-cell--flagged' : ''}`}
                                >
                                  <span className="block-cell__set-value">
                                    {formatSet(cell.reps, cell.weight, cell.time)}
                                  </span>
                                  {si === 0 && !cell.flagged && cell.arrow && <ArrowIndicator arrow={cell.arrow} />}
                                  {cell.autoFlagged && <span className="block-cell__flag-icon" title="Likely data entry error (auto-detected)">&#x26A0;&#xFE0F;</span>}
                                  {cell.manualFlagged && <span className="block-cell__flag-icon" title="Flagged by coach">&#x1F6A9;</span>}
                                  {(cell.reps != null || cell.weight != null || cell.time != null) && sessionData && (
                                    <button
                                      className={`block-cell__flag-btn${cell.manualFlagged ? ' block-cell__flag-btn--active' : ''}`}
                                      title={cell.manualFlagged ? 'Remove flag' : 'Flag as data error'}
                                      onClick={() => handleToggleFlag(
                                        clientId,
                                        sessionData.workoutId,
                                        row.exercise,
                                        sr.setNum,
                                        !cell.manualFlagged
                                      )}
                                    >
                                      {cell.manualFlagged ? '\u2715' : '\u2691'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))}

                    {/* Indicator rows */}
                    {indicatorRows && indicatorRows.map((ind, ii) => (
                      <React.Fragment key={`ind-${ii}`}>
                        {ind.cells.map((cell, ci) => (
                          <div key={`ic-${ii}-${ci}`} className="block-cell block-cell--indicator">
                            {cell.done && (
                              <span className="block-cell__indicator-content">
                                <span className="block-cell__indicator-values">
                                  {cell.timeStr && <span>{cell.timeStr}</span>}
                                  {cell.distanceStr && <span>{cell.distanceStr}</span>}
                                </span>
                                {cell.arrow && <ArrowIndicator arrow={cell.arrow} />}
                              </span>
                            )}
                          </div>
                        ))}
                      </React.Fragment>
                    ))}

                    {/* Total volume row */}
                    {sessions.map((s, i) => (
                      <div key={`tv-${i}`} className={`block-cell block-cell--total ${COLOR_CLASS[s.totalVolumeColor] || ''}`}>
                        <span className="block-cell__value">
                          {s.totalVolume >= 1000 ? `${(s.totalVolume / 1000).toFixed(1)}k` : s.totalVolume}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Trend line */}
              {trendData && trendData.length > 1 && (
                <div className="block-trend">
                  <span className="block-trend__label">Total volume trend</span>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={fmtShort}
                        tick={{ fontSize: 10, fill: 'var(--color-slate)' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--color-slate)' }}
                        domain={['auto', 'auto']}
                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                      />
                      <Tooltip
                        content={({ active, payload }) => (
                          <ChartTooltip
                            active={active}
                            payload={payload}
                            labelFormatter={(p) => fmtShort(p.date)}
                            valueFormatter={(v) => v.toLocaleString()}
                            valueSuffix=" kg total"
                          />
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey="totalVolume"
                        stroke="var(--color-teal)"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: 'var(--color-teal)' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// =====================
// MAIN COMPONENT
// =====================

function TrainingTab({ clientId }) {
  const [calendarData, setCalendarData] = useState(null);
  const [calendarRange, setCalendarRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/training/${clientId}/calendar`);
      if (!res.ok) throw new Error('Failed to fetch training calendar');
      const json = await res.json();
      setCalendarData(json.calendar);
      setCalendarRange(json.range);
    } catch (err) {
      console.error('Training calendar fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId) fetchCalendar();
  }, [clientId, fetchCalendar]);

  if (loading) return <div className="training-loading">Loading training data...</div>;
  if (error) return <div className="training-error">Failed to load training data</div>;

  return (
    <div className="training-tab">
      <SessionCalendar data={calendarData} range={calendarRange} />
      <KeyLiftsTracker clientId={clientId} />
      <BlockProgress clientId={clientId} />
    </div>
  );
}

export default TrainingTab;
