import React, { useState, useEffect } from 'react';
import './NutritionTab.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

// Extract MFP username from URL for day-level deep links
function getMfpUsername(mfpUrl) {
  if (!mfpUrl) return null;
  const match = mfpUrl.match(/\/food\/diary\/([^/?#]+)/);
  return match ? match[1] : null;
}

function MfpDayLink({ mfpUrl, date }) {
  const username = getMfpUsername(mfpUrl);
  if (!username) return null;
  return (
    <a
      href={`https://www.myfitnesspal.com/food/diary/${username}?date=${date}`}
      target="_blank"
      rel="noopener noreferrer"
      className="nt__mfp-day"
      title="Open in MyFitnessPal"
      onClick={(e) => e.stopPropagation()}
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        <path d="M11.5 7.5v3.5a1 1 0 01-1 1H3a1 1 0 01-1-1V3.5a1 1 0 011-1h3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 2h3v3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 8L12 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

/* ── Calorie Arc ── */
function CalorieArc({ actual, goal }) {
  const pct = goal > 0 ? actual / goal : 0;
  const radius = 80;
  const stroke = 12;
  const startAngle = -210;
  const endAngle = 30;
  const totalArc = endAngle - startAngle; // 240 degrees

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, startDeg, endDeg) {
    if (endDeg - startDeg < 0.5) return '';
    const start = polarToCartesian(cx, cy, r, endDeg);
    const end = polarToCartesian(cx, cy, r, startDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  }

  const cx = 100;
  const cy = 100;

  // Full background arc represents the goal
  const bgPath = describeArc(cx, cy, radius, startAngle, endAngle);

  // Filled arc represents actual consumption (capped at goal portion)
  const fillEnd = startAngle + totalArc * Math.min(pct, 1);
  const fillPath = pct > 0 ? describeArc(cx, cy, radius, startAngle, fillEnd) : '';

  // Overflow arc beyond the goal (for over-eating)
  const overEnd = startAngle + totalArc * Math.min(pct, 1.25);
  const overPath = pct > 1 ? describeArc(cx, cy, radius, startAngle + totalArc, overEnd) : '';

  const isOver = actual > goal;
  const diff = actual - goal;
  const diffStr = isOver ? `+${Math.abs(diff).toLocaleString()} kcal` : `-${Math.abs(diff).toLocaleString()} kcal`;
  const diffColor = isOver ? 'var(--color-red)' : 'var(--color-teal)';
  const fillColor = isOver ? 'var(--color-amber)' : 'var(--color-teal)';

  return (
    <div className="nt__arc-wrap">
      <svg viewBox="0 0 200 200" className="nt__arc-svg">
        {/* Background track - represents goal */}
        <path d={bgPath} fill="none" stroke="var(--color-border)" strokeWidth={stroke} strokeLinecap="round" />
        {/* Filled arc - actual consumed */}
        {fillPath && (
          <path d={fillPath} fill="none" stroke={fillColor} strokeWidth={stroke} strokeLinecap="round" />
        )}
        {/* Overflow indicator - red for clear visibility */}
        {overPath && (
          <path d={overPath} fill="none" stroke="var(--color-red)" strokeWidth={stroke} strokeLinecap="round" />
        )}
      </svg>
      <div className="nt__arc-center">
        <span className="nt__arc-actual">{actual.toLocaleString()}</span>
        <span className="nt__arc-unit">kcal avg</span>
        <span className="nt__arc-goal-label">Goal: {goal.toLocaleString()}</span>
      </div>
      <div className="nt__arc-diff" style={{ color: diffColor }}>
        {diffStr}
      </div>
    </div>
  );
}

/* ── Macro Bar ── */
function MacroBar({ label, actual, goal, color, unit }) {
  const pct = goal > 0 ? Math.min((actual / goal) * 100, 130) : 0;
  const diff = actual - goal;
  const diffPct = goal > 0 ? Math.abs(diff) / goal : 0;

  let status = 'amber';
  if (diffPct <= 0.10) status = 'amber';
  else if (label === 'Protein' || label === 'Fibre') {
    status = diff >= 0 ? 'green' : 'red';
  } else if (label === 'Fats') {
    status = diff <= 0 ? 'green' : 'red';
  }

  const sign = diff > 0 ? '+' : '';

  return (
    <div className="nt__bar">
      <div className="nt__bar-top">
        <span className="nt__bar-label">{label}</span>
        <span className="nt__bar-nums">
          <span className="nt__bar-actual">{actual}{unit}</span>
          <span className="nt__bar-sep">/</span>
          <span className="nt__bar-goal">{goal}{unit}</span>
          <span className={`nt__bar-diff nt__bar-diff--${status}`}>({sign}{diff}{unit})</span>
        </span>
      </div>
      <div className="nt__bar-track">
        <div
          className="nt__bar-fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
        {pct > 100 && (
          <div
            className="nt__bar-over"
            style={{ width: `${pct - 100}%`, background: color, opacity: 0.4 }}
          />
        )}
        <div className="nt__bar-marker" style={{ left: '100%' }} />
      </div>
    </div>
  );
}

/* ── Saturated Fat Gauge ── */
function SatFatGauge({ satFatGrams, totalCalories }) {
  if (!totalCalories || totalCalories === 0) return null;

  const satCalories = satFatGrams * 9;
  const pct = (satCalories / totalCalories) * 100;
  const pctRounded = Math.round(pct * 10) / 10;

  const aboveWho = pct > 10;

  // Scale: 0% to 15% of calories
  const scaleMax = 15;
  const markerPos = Math.min((pct / scaleMax) * 100, 100);
  const whoPos = (10 / scaleMax) * 100;

  return (
    <div className="nt__satfat">
      <h3 className="nt__satfat-title">Saturated Fat</h3>
      <div className="nt__satfat-stats">
        <span className="nt__satfat-grams">{satFatGrams}g</span>
        <span className="nt__satfat-sep">avg daily</span>
        <span className={`nt__satfat-pct nt__satfat-pct--${aboveWho ? 'amber' : 'green'}`}>{pctRounded}% of calories</span>
      </div>

      <div className="nt__gauge">
        {/* Green zone: 0-10% */}
        <div className="nt__gauge-zone nt__gauge-zone--green" style={{ width: `${whoPos}%` }} />
        {/* Amber zone: 10%+ */}
        <div className="nt__gauge-zone nt__gauge-zone--amber" style={{ left: `${whoPos}%`, width: `${100 - whoPos}%` }} />

        {/* WHO threshold line */}
        <div className="nt__gauge-line" style={{ left: `${whoPos}%` }}>
          <span className="nt__gauge-line-label">10%<br/>WHO max</span>
        </div>

        {/* Client marker */}
        <div className={`nt__gauge-marker nt__gauge-marker--${aboveWho ? 'amber' : 'green'}`} style={{ left: `${markerPos}%` }}>
          <span className="nt__gauge-marker-val">{pctRounded}%</span>
        </div>
      </div>

      {aboveWho ? (
        <p className="nt__satfat-status nt__satfat-status--amber">
          Above the WHO recommended threshold - worth discussing sources
        </p>
      ) : (
        <p className="nt__satfat-status nt__satfat-status--green">
          Within WHO recommended threshold
        </p>
      )}
    </div>
  );
}

/* ── Stacked Macro Bar (daily breakdown) ── */
function StackedBar({ protein, fats, carbs, muted }) {
  const total = protein + fats + carbs;
  if (total === 0) return <div className="nt__stack nt__stack--empty" />;

  const pPct = (protein / total) * 100;
  const fPct = (fats / total) * 100;
  const cPct = (carbs / total) * 100;

  // Segment is too narrow if under ~15% of the bar
  const MIN_LABEL_PCT = 15;

  return (
    <div className={`nt__stack ${muted ? 'nt__stack--muted' : ''}`}>
      <div className="nt__stack-seg" style={{ width: `${pPct}%`, background: 'var(--nt-protein)' }}>
        {pPct >= MIN_LABEL_PCT ? (
          <span className="nt__stack-label">{protein}g</span>
        ) : (
          <span className="nt__stack-label nt__stack-label--outside">{protein}g</span>
        )}
      </div>
      <div className="nt__stack-seg" style={{ width: `${fPct}%`, background: 'var(--nt-fats)' }}>
        {fPct >= MIN_LABEL_PCT ? (
          <span className="nt__stack-label">{fats}g</span>
        ) : (
          <span className="nt__stack-label nt__stack-label--outside">{fats}g</span>
        )}
      </div>
      <div className="nt__stack-seg" style={{ width: `${cPct}%`, background: 'var(--nt-carbs)' }}>
        {cPct >= MIN_LABEL_PCT ? (
          <span className="nt__stack-label">{carbs}g</span>
        ) : (
          <span className="nt__stack-label nt__stack-label--outside">{carbs}g</span>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */
function NutritionTab({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDays, setExpandedDays] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpandedDays({});

    async function fetchData() {
      try {
        const res = await fetch(`${API_BASE}/api/nutrition/${clientId}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        if (!cancelled) { setData(json); setLoading(false); }
      } catch (err) {
        if (!cancelled) { setError(err.message); setLoading(false); }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [clientId]);

  const toggleDay = (date) => {
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));
  };

  if (loading) return <div className="nt"><div className="nt__loading">Loading nutrition data...</div></div>;
  if (error) return <div className="nt"><div className="nt__error">Failed to load nutrition data</div></div>;
  if (!data) return null;

  const { mfpUrl, goals, actuals, weekSummary, dailyBreakdown } = data;

  return (
    <div className="nt">
      {/* MFP Link */}
      <section className="nt__section">
        {mfpUrl ? (
          <a href={mfpUrl} target="_blank" rel="noopener noreferrer" className="nt__mfp-btn">
            <svg className="nt__mfp-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M15 9.75v4.5A1.5 1.5 0 0113.5 15.75h-9A1.5 1.5 0 013 14.25v-9A1.5 1.5 0 014.5 3.75h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 2.25h3.75V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7.5 10.5L15.75 2.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Open MyFitnessPal Diary
          </a>
        ) : (
          <button className="nt__mfp-btn nt__mfp-btn--disabled" disabled>No MFP diary linked</button>
        )}
      </section>

      {/* ── Goals vs Actuals ── */}
      <section className="nt__section">
        <h2 className="nt__section-title">Goals vs Actuals</h2>
        {weekSummary && (
          <p className="nt__period">{weekSummary.range.start} to {weekSummary.range.end}</p>
        )}

        {goals && actuals ? (
          <>
            {/* Hero: Calorie Arc + Macro Bars side by side */}
            <div className="nt__hero">
              <CalorieArc actual={actuals.calories} goal={goals.calories} />
              <div className="nt__bars">
                <MacroBar label="Protein" actual={actuals.protein} goal={goals.protein} color="var(--nt-protein)" unit="g" />
                <MacroBar label="Carbs" actual={actuals.carbs} goal={goals.carbs} color="var(--nt-carbs)" unit="g" />
                <MacroBar label="Fats" actual={actuals.fats} goal={goals.fats} color="var(--nt-fats)" unit="g" />
                <div className="nt__fibre-row">
                  <span className="nt__fibre-dot" />
                  <span className="nt__fibre-label">Fibre</span>
                  <span className="nt__fibre-val">{actuals.fibre}g</span>
                  <span className="nt__fibre-sep">/</span>
                  <span className="nt__fibre-goal">{goals.fibre}g</span>
                  {actuals.fibre >= goals.fibre ? (
                    <span className="nt__fibre-badge nt__fibre-badge--green">On target</span>
                  ) : (
                    <span className="nt__fibre-badge nt__fibre-badge--red">
                      {actuals.fibre - goals.fibre}g
                    </span>
                  )}
                </div>
              </div>
            </div>

            {weekSummary && weekSummary.excluded.length > 0 && (
              <p className="nt__tracking-note">
                Average based on {weekSummary.included.join(', ')} - {weekSummary.excluded.join(', ')} excluded due to insufficient tracking
              </p>
            )}
            {weekSummary && weekSummary.excluded.length === 0 && weekSummary.included.length > 0 && (
              <p className="nt__tracking-note nt__tracking-note--good">All 7 days included in average</p>
            )}
          </>
        ) : (
          <div className="nt__empty-state">
            {!goals ? 'No nutrition goals set in Trainerize' : 'No tracking data for last week'}
          </div>
        )}
      </section>

      {/* ── Saturated Fat Gauge ── */}
      {actuals && actuals.saturatedFat > 0 && actuals.calories > 0 && (
        <section className="nt__section">
          <SatFatGauge satFatGrams={actuals.saturatedFat} totalCalories={actuals.calories} />
        </section>
      )}

      {/* ── Daily Breakdown ── */}
      <section className="nt__section">
        <h2 className="nt__section-title">Daily Breakdown</h2>

        {/* Legend */}
        <div className="nt__stack-legend">
          <span className="nt__stack-leg"><span className="nt__stack-leg-dot" style={{ background: 'var(--nt-protein)' }} />Protein</span>
          <span className="nt__stack-leg"><span className="nt__stack-leg-dot" style={{ background: 'var(--nt-fats)' }} />Fats</span>
          <span className="nt__stack-leg"><span className="nt__stack-leg-dot" style={{ background: 'var(--nt-carbs)' }} />Carbs</span>
        </div>

        {dailyBreakdown.map(week => (
          <div key={week.label} className="nt__week-group">
            <h3 className="nt__week-label">{week.label}</h3>
            <div className="nt__day-list">
              {week.days.map(day => {
                const isExpanded = expandedDays[day.date];
                const hasData = day.calories > 0;
                const muted = hasData && !day.sufficientTracking;
                const statusClass = !hasData ? 'none' : (day.sufficientTracking ? 'tracked' : 'low');

                return (
                  <div key={day.date} className={`nt__day ${muted ? 'nt__day--muted' : ''} ${!hasData ? 'nt__day--empty' : ''}`}>
                    <button className="nt__day-row" onClick={() => toggleDay(day.date)} aria-expanded={isExpanded}>
                      <span className={`nt__day-dot nt__day-dot--${statusClass}`} />
                      <span className="nt__day-name">{day.dayShort}</span>
                      <span className="nt__day-date">{day.date}</span>

                      {hasData ? (
                        <>
                          <span className={`nt__day-cal ${muted ? 'nt__day-cal--muted' : ''}`}>{day.calories}</span>
                          <span className="nt__day-cal-unit">kcal</span>
                          <div className="nt__day-bar-wrap">
                            <StackedBar protein={day.protein} fats={day.fats} carbs={day.carbs} muted={muted} />
                          </div>
                          {muted && (
                            <span className="nt__day-partial">{day.trackingPercent}% tracked</span>
                          )}
                        </>
                      ) : (
                        <span className="nt__day-nodata">No data</span>
                      )}

                      <MfpDayLink mfpUrl={mfpUrl} date={day.date} />
                      <span className={`nt__day-chev ${isExpanded ? 'nt__day-chev--open' : ''}`}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>

                    {isExpanded && hasData && (
                      <div className="nt__day-detail">
                        <div className="nt__detail-grid">
                          <DetailItem label="Calories" value={`${day.calories}kcal`} color="var(--nt-calories)" />
                          <DetailItem label="Protein" value={`${day.protein}g`} color="var(--nt-protein)" />
                          <DetailItem label="Fats" value={`${day.fats}g`} color="var(--nt-fats)" />
                          <DetailItem label="Carbs" value={`${day.carbs}g`} color="var(--nt-carbs)" />
                          <DetailItem label="Fibre" value={`${day.fibre}g`} color="var(--nt-fibre)" />
                          <DetailItem label="Sat. Fat" value={day.saturatedFat > 0 ? `${day.saturatedFat}g` : '-'} color="var(--nt-satfat)" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function DetailItem({ label, value, color }) {
  return (
    <div className="nt__detail-item">
      <span className="nt__detail-dot" style={{ background: color }} />
      <span className="nt__detail-label">{label}</span>
      <span className="nt__detail-value">{value}</span>
    </div>
  );
}

export default NutritionTab;
