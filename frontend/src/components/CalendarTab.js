import React, { useState, useEffect, useCallback, useRef } from 'react';
import './CalendarTab.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Format YYYY-MM from year and month number (1-based)
function toMonthStr(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Get today as YYYY-MM-DD in Europe/Dublin timezone
function getTodayStr() {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
}

// Format a date string to readable form for tooltip
function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-IE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Build the grid of weeks for a given month
// Returns array of weeks, each week is an array of 7 day objects
function buildMonthGrid(year, month) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const daysInMonth = lastDay.getUTCDate();

  // Day of week for first day (0=Sun, adjust to Mon=0)
  let startDow = firstDay.getUTCDay();
  startDow = startDow === 0 ? 6 : startDow - 1; // Mon=0, Sun=6

  const cells = [];

  // Leading empty cells (days from previous month)
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: null, outside: true });
  }

  // Days of the month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date: dateStr, outside: false });
  }

  // Trailing empty cells to complete last week
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, outside: true });
  }

  // Group into weeks of 7
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return weeks;
}

// Max activities to show in a cell before "+X more"
const MAX_VISIBLE = 2;

function CalendarTab({ clientId }) {
  const [year, setYear] = useState(() => {
    const now = new Date();
    return parseInt(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric' }));
  });
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return parseInt(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin', month: 'numeric' }));
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const tooltipRef = useRef(null);

  const todayStr = getTodayStr();

  // Fetch calendar data
  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const monthStr = toMonthStr(year, month);
      const res = await fetch(`${API_BASE}/api/calendar/${clientId}?month=${monthStr}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
      setData({ days: [] });
    } finally {
      setLoading(false);
    }
  }, [clientId, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close tooltip on outside click
  useEffect(() => {
    if (!tooltip) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setTooltip(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [tooltip]);

  // Navigation handlers
  const goToPrevMonth = useCallback(() => {
    setTooltip(null);
    if (month === 1) {
      setYear(y => y - 1);
      setMonth(12);
    } else {
      setMonth(m => m - 1);
    }
  }, [month]);

  const goToNextMonth = useCallback(() => {
    setTooltip(null);
    if (month === 12) {
      setYear(y => y + 1);
      setMonth(1);
    } else {
      setMonth(m => m + 1);
    }
  }, [month]);

  // Build day data lookup
  const dayDataMap = React.useMemo(() => {
    const map = {};
    if (data?.days) {
      for (const day of data.days) {
        map[day.date] = day;
      }
    }
    return map;
  }, [data?.days]);

  const weeks = buildMonthGrid(year, month);

  // Handle day click for tooltip
  const handleDayClick = useCallback((e, dateStr) => {
    const dayData = dayDataMap[dateStr];
    if (!dayData) return;
    if (dayData.activities.length === 0 && !dayData.bodyStatsLogged) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipX = Math.min(rect.left + rect.width / 2, window.innerWidth - 340);
    const tooltipY = rect.bottom + 8;
    const adjustedY = tooltipY + 200 > window.innerHeight ? rect.top - 8 : tooltipY;

    setTooltip({
      date: dateStr,
      x: Math.max(10, tooltipX),
      y: adjustedY > window.innerHeight - 50 ? rect.top - 220 : adjustedY,
      data: dayData,
    });
  }, [dayDataMap]);

  if (loading) {
    return (
      <div className="calendar-tab">
        <div className="calendar-tab__loading">
          <div className="calendar-tab__spinner" />
          Loading calendar...
        </div>
      </div>
    );
  }

  const hasData = data?.days && data.days.some(d =>
    d.activities.length > 0 || d.bodyStatsLogged || d.weight || d.calories || d.sleep
  );

  return (
    <div className="calendar-tab">
      {/* Month navigation */}
      <div className="calendar-tab__nav">
        <button
          className="calendar-tab__nav-btn"
          onClick={goToPrevMonth}
          aria-label="Previous month"
          title="Previous month"
        >
          &#8249;
        </button>
        <span className="calendar-tab__month-label">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          className="calendar-tab__nav-btn"
          onClick={goToNextMonth}
          aria-label="Next month"
          title="Next month"
        >
          &#8250;
        </button>
      </div>

      {!hasData && !loading ? (
        <div className="calendar-tab__empty">
          No activity data for this month
        </div>
      ) : (
        <div className="calendar-tab__grid">
          {/* Day name headers */}
          <div className="calendar-tab__header">
            {DAY_NAMES.map(name => (
              <div key={name} className="calendar-tab__header-cell">
                {name}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="calendar-tab__body">
            {weeks.flat().map((cell, i) => {
              if (cell.outside) {
                return (
                  <div key={i} className="calendar-tab__day calendar-tab__day--outside">
                    <div className="calendar-tab__date" />
                  </div>
                );
              }

              const dayData = dayDataMap[cell.date];
              const activities = dayData?.activities || [];
              const bodyStats = dayData?.bodyStatsLogged || false;
              const weight = dayData?.weight;
              const calories = dayData?.calories;
              const protein = dayData?.protein;
              const sleep = dayData?.sleep;
              const insufficientTracking = dayData?.insufficientTracking;
              const isToday = cell.date === todayStr;
              const hasContent = activities.length > 0 || bodyStats || weight || calories || sleep;
              const visibleActivities = activities.slice(0, MAX_VISIBLE);
              const overflowCount = activities.length - MAX_VISIBLE;
              const dayNum = parseInt(cell.date.split('-')[2]);
              const hasStats = weight || calories || sleep;

              return (
                <div
                  key={i}
                  className={`calendar-tab__day${isToday ? ' calendar-tab__day--today' : ''}${hasContent ? ' calendar-tab__day--has-tooltip' : ''}`}
                  onClick={hasContent ? (e) => handleDayClick(e, cell.date) : undefined}
                >
                  <div className="calendar-tab__date">{dayNum}</div>

                  {bodyStats && (
                    <div className="calendar-tab__body-stats" title="Body stats logged" />
                  )}

                  {activities.length > 0 && (
                    <div className="calendar-tab__activities">
                      {visibleActivities.map((a, ai) => (
                        <div
                          key={ai}
                          className={`calendar-tab__activity calendar-tab__activity--${a.type}${a.status === 'scheduled' ? ' calendar-tab__activity--scheduled' : ''}`}
                        >
                          <span className="calendar-tab__activity-name">{a.name}</span>
                          {a.duration && (
                            <span className="calendar-tab__activity-meta">{a.duration}</span>
                          )}
                        </div>
                      ))}
                      {overflowCount > 0 && (
                        <div className="calendar-tab__more">+{overflowCount} more</div>
                      )}
                    </div>
                  )}

                  {hasStats && (
                    <div className="calendar-tab__day-stats">
                      {weight && (
                        <span className="calendar-tab__stat calendar-tab__stat--weight">
                          {weight} kg
                        </span>
                      )}
                      {calories && (
                        <span className={`calendar-tab__stat calendar-tab__stat--calories${insufficientTracking ? ' calendar-tab__stat--muted' : ''}`}>
                          {calories.toLocaleString()} kcal
                        </span>
                      )}
                      {protein && (
                        <span className={`calendar-tab__stat calendar-tab__stat--protein${insufficientTracking ? ' calendar-tab__stat--muted' : ''}`}>
                          {protein}g P
                        </span>
                      )}
                      {sleep && (
                        <span className="calendar-tab__stat calendar-tab__stat--sleep">
                          <svg className="calendar-tab__sleep-icon" width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278z"/></svg>
                          {sleep}h
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tooltip overlay */}
      {tooltip && (
        <>
          <div
            className="calendar-tab__tooltip-overlay"
            onClick={() => setTooltip(null)}
          />
          <div
            ref={tooltipRef}
            className="calendar-tab__tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="calendar-tab__tooltip-date">
              {formatDateLong(tooltip.date)}
            </div>
            <div className="calendar-tab__tooltip-list">
              {tooltip.data.activities.map((a, ai) => (
                <div key={ai} className="calendar-tab__tooltip-item">
                  <div
                    className={`calendar-tab__tooltip-dot calendar-tab__tooltip-dot--${a.type}${a.status === 'scheduled' ? '-scheduled' : ''}`}
                  />
                  <div className="calendar-tab__tooltip-detail">
                    <div className={`calendar-tab__tooltip-name${a.status === 'scheduled' ? ' calendar-tab__tooltip-name--scheduled' : ''}`}>
                      {a.name}
                    </div>
                    {(a.duration || a.distance) && (
                      <div className="calendar-tab__tooltip-meta">
                        {[a.duration, a.distance].filter(Boolean).join(' - ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {(tooltip.data.weight || tooltip.data.calories || tooltip.data.sleep || tooltip.data.bodyStatsLogged) && (
              <div className="calendar-tab__tooltip-stats">
                {tooltip.data.weight && (
                  <div className="calendar-tab__tooltip-stat">
                    <span className="calendar-tab__tooltip-stat-label">Weight</span>
                    <span className="calendar-tab__tooltip-stat-value">{tooltip.data.weight} kg</span>
                  </div>
                )}
                {tooltip.data.calories && (
                  <div className={`calendar-tab__tooltip-stat${tooltip.data.insufficientTracking ? ' calendar-tab__tooltip-stat--muted' : ''}`}>
                    <span className="calendar-tab__tooltip-stat-label">Calories{tooltip.data.insufficientTracking ? ' (partial)' : ''}</span>
                    <span className="calendar-tab__tooltip-stat-value">{tooltip.data.calories.toLocaleString()} kcal</span>
                  </div>
                )}
                {tooltip.data.protein && (
                  <div className={`calendar-tab__tooltip-stat${tooltip.data.insufficientTracking ? ' calendar-tab__tooltip-stat--muted' : ''}`}>
                    <span className="calendar-tab__tooltip-stat-label">Protein</span>
                    <span className={`calendar-tab__tooltip-stat-value${tooltip.data.insufficientTracking ? '' : ' calendar-tab__tooltip-stat-value--protein'}`}>{tooltip.data.protein}g</span>
                  </div>
                )}
                {tooltip.data.sleep && (
                  <div className="calendar-tab__tooltip-stat">
                    <span className="calendar-tab__tooltip-stat-label">Sleep</span>
                    <span className="calendar-tab__tooltip-stat-value">{tooltip.data.sleep}h</span>
                  </div>
                )}
                {tooltip.data.bodyStatsLogged && !tooltip.data.weight && (
                  <div className="calendar-tab__tooltip-stat">
                    <div className="calendar-tab__tooltip-body-stats-dot" />
                    <span className="calendar-tab__tooltip-stat-label">Body stats logged</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default CalendarTab;
