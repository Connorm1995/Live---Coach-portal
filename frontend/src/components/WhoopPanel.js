import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import './WhoopPanel.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

/**
 * WhoopPanel
 *
 * Built for reading during a check-in, which is a different job from glancing
 * at a number. The question a coach is answering is "which way is this going,
 * and what moved together", so the panel is four charts stacked on ONE shared
 * time axis rather than four separate cards.
 *
 * That alignment is the whole point. Recovery falling matters far less than
 * recovery falling in the same week sleep collapsed and strain stayed high -
 * and that is only visible when the days line up vertically. Every lane also
 * shares a Recharts syncId, so hovering any one of them draws the cursor
 * across all four and reads out that day everywhere at once.
 *
 * An earlier version of this was four tiles showing a value and a 10-day
 * average. It answered "what is it now" and hid every trend in the data.
 */

const RANGES = [
  { key: 14, label: '14 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
];

// Whoop's own recovery bands. Coaches and clients both read these colours in
// the Whoop app, so reusing them means no translation step.
const BAND_LOW = 34;
const BAND_HIGH = 67;

// A lane's y-axis width is fixed so all four lanes line up on the left edge.
// Without this each axis sizes to its own labels and the days stop aligning,
// which defeats the entire design.
const AXIS_WIDTH = 44;
const CHART_MARGIN = { top: 6, right: 14, bottom: 0, left: 0 };

function fmtDay(dateStr) {
  // Dates arrive as plain YYYY-MM-DD already in Europe/Dublin. Parsed as UTC so
  // the browser's own timezone cannot shift them a day.
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}

function fmtDayLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IE', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  });
}

function hoursLabel(h) {
  if (h == null) return '-';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${whole}h ${String(mins).padStart(2, '0')}m`;
}

function mean(values) {
  const clean = values.filter(v => v != null && !Number.isNaN(v));
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

// ---------------------------------------------------------------------------
// Headline readouts
// ---------------------------------------------------------------------------

/**
 * A metric's recent average against the period before it.
 *
 * Deliberately compares the last 7 days with the 7 before, regardless of the
 * range on screen. A check-in is a weekly conversation, so "this week against
 * last week" is the comparison being made out loud, and it should not silently
 * change meaning when the chart range is switched to 90 days.
 */
function trendOf(days, key) {
  const series = days.map(d => d[key]);
  const recent = mean(series.slice(-7));
  const prior = mean(series.slice(-14, -7));
  if (recent == null) return { recent: null, delta: null, pct: null };
  if (prior == null) return { recent, delta: null, pct: null };
  const delta = recent - prior;
  return { recent, delta, pct: prior === 0 ? null : (delta / prior) * 100 };
}

/**
 * The offset the client was actually living in over this range, as the most
 * common one Whoop reported.
 *
 * Worth surfacing because the portal's house rule is to label everything Dublin
 * time, and these days are deliberately NOT Dublin days - a night is bucketed
 * where the client slept. Cian is in Australia, so "Saturday" here means his
 * Saturday. Saying so is the difference between a coach reading the chart
 * correctly and quietly misreading every date on it.
 */
function dominantOffset(days) {
  const counts = new Map();
  for (const d of days) {
    if (!d.timezoneOffset) continue;
    counts.set(d.timezoneOffset, (counts.get(d.timezoneOffset) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [off, n] of counts) if (n > bestN) { best = off; bestN = n; }
  return best;
}

/** Dublin's own UTC offset right now, to compare against. */
function dublinOffsetNow() {
  const name = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Dublin', timeZoneName: 'longOffset',
  }).formatToParts(new Date()).find(p => p.type === 'timeZoneName').value;
  const m = /GMT([+-]\d{2}:\d{2})/.exec(name);
  return m ? m[1] : '+00:00';
}

function Sparkline({ values, stroke }) {
  const clean = values.map(v => (v == null ? null : Number(v)));
  const present = clean.filter(v => v != null);
  if (present.length < 2) return null;

  const w = 76;
  const h = 24;
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;

  // Gaps stay gaps: a missing day breaks the line rather than being bridged,
  // so a week Cian did not wear the strap never looks like a smooth trend.
  const segments = [];
  let current = [];
  clean.forEach((v, i) => {
    if (v == null) {
      if (current.length > 1) segments.push(current);
      current = [];
      return;
    }
    const x = (i / (clean.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current);

  return (
    <svg className="whoop__spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {segments.map((pts, i) => (
        <polyline key={i} points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function Readout({ label, value, unit, trend, stroke, series, goodWhen = 'up', hint }) {
  const { delta, pct } = trend;
  let direction = 'flat';
  if (delta != null && Math.abs(delta) > 0.0001) direction = delta > 0 ? 'up' : 'down';

  // Up is not automatically good. Resting heart rate rising is the opposite.
  let tone = 'neutral';
  if (direction !== 'flat') {
    const rising = direction === 'up';
    tone = (goodWhen === 'up') === rising ? 'good' : 'bad';
  }

  return (
    <div className="whoop__readout">
      <span className="whoop__readout-label">{label}</span>
      <span className="whoop__readout-value">
        {value != null ? value : '-'}
        {value != null && unit ? <span className="whoop__readout-unit">{unit}</span> : null}
      </span>
      <div className="whoop__readout-foot">
        <span className={`whoop__delta whoop__delta--${tone}`}>
          {delta == null ? 'No comparison yet' : (
            <>
              <span aria-hidden="true">{direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'}</span>
              {' '}
              {pct != null ? `${Math.abs(pct).toFixed(0)}%` : Math.abs(delta).toFixed(1)} vs last week
            </>
          )}
        </span>
        <Sparkline values={series} stroke={stroke} />
      </div>
      {hint && <span className="whoop__readout-hint">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day inspector
// ---------------------------------------------------------------------------

function bandOf(score) {
  if (score == null) return null;
  if (score >= BAND_HIGH) return 'high';
  if (score >= BAND_LOW) return 'mid';
  return 'low';
}

/**
 * The whole day, read in one fixed place.
 *
 * Recharts renders one tooltip per chart, so four synced lanes produced four
 * stacked copies of the same readout. Beyond that, a tooltip that follows the
 * pointer is the wrong instrument here: during a check-in the coach scans
 * across days, and the numbers should hold still while the days change.
 *
 * So the lanes draw only the cursor line and this strip does the reading. With
 * nothing hovered it shows the most recent day, so the panel says something
 * useful at rest instead of sitting blank.
 */
function DayInspector({ day, hovering }) {
  if (!day) return null;

  const debt = day.sleepHours != null && day.sleepNeededHours != null
    ? day.sleepNeededHours - day.sleepHours
    : null;

  const cells = [
    { k: 'Recovery', v: day.recoveryScore != null ? `${Math.round(day.recoveryScore)}%` : '-', band: bandOf(day.recoveryScore) },
    { k: 'HRV', v: day.hrv != null ? `${Math.round(day.hrv)} ms` : '-' },
    { k: 'Resting HR', v: day.restingHR != null ? `${day.restingHR} bpm` : '-' },
    { k: 'Strain', v: day.strain != null ? day.strain.toFixed(1) : '-' },
    { k: 'Slept', v: hoursLabel(day.sleepHours) },
    { k: 'Needed', v: hoursLabel(day.sleepNeededHours) },
    { k: 'Deep', v: hoursLabel(day.deepHours) },
    { k: 'REM', v: hoursLabel(day.remHours) },
    { k: 'Disturbances', v: day.disturbances != null ? String(day.disturbances) : '-' },
    { k: 'Consistency', v: day.sleepConsistency != null ? `${Math.round(day.sleepConsistency)}%` : '-' },
  ];

  return (
    <div className="whoop__inspector">
      <p className="whoop__inspector-date">
        <span className="whoop__inspector-when">{hovering ? 'Hovering' : 'Most recent'}</span>
        <strong>{fmtDayLong(day.date)}</strong>
      </p>
      <dl className="whoop__inspector-cells">
        {cells.map(c => (
          <div key={c.k} className={c.band ? `whoop__cell whoop__cell--${c.band}` : 'whoop__cell'}>
            <dt>{c.k}</dt><dd>{c.v}</dd>
          </div>
        ))}
        {debt != null && debt > 0 && (
          <div className="whoop__cell whoop__cell--short">
            <dt>Short by</dt><dd>{hoursLabel(debt)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

function Lane({ title, note, height, children }) {
  return (
    <div className="whoop__lane">
      <div className="whoop__lane-head">
        <h4 className="whoop__lane-title">{title}</h4>
        {note && <span className="whoop__lane-note">{note}</span>}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------

function WhoopPanel({ clientId, clientName, lastSyncAt }) {
  const [rangeDays, setRangeDays] = useState(30);
  const [hoverDate, setHoverDate] = useState(null);
  const [days, setDays] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (rangeDays - 1));
      const iso = (d) => d.toISOString().split('T')[0];

      const res = await fetch(
        `${API_BASE}/api/whoop/${clientId}/daily?start=${iso(start)}&end=${iso(end)}`
      );
      if (!res.ok) throw new Error('Could not load Whoop data');
      const data = await res.json();
      setDays(data.days || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId, rangeDays]);

  useEffect(() => { fetchDays(); }, [fetchDays]);

  const dayMap = useMemo(() => {
    const m = {};
    for (const d of days || []) m[d.date] = d;
    return m;
  }, [days]);

  const chartData = useMemo(() => (days || []).map(d => ({
    ...d,
    // Recharts stacks by summing, so the three stages are passed through as-is
    // and the bar's total height is the time actually asleep.
    deep: d.deepHours,
    rem: d.remHours,
    light: d.lightHours,
  })), [days]);

  const trends = useMemo(() => {
    if (!days || days.length === 0) return null;
    return {
      recovery: trendOf(days, 'recoveryScore'),
      hrv: trendOf(days, 'hrv'),
      sleep: trendOf(days, 'sleepHours'),
      strain: trendOf(days, 'strain'),
      rhr: trendOf(days, 'restingHR'),
    };
  }, [days]);

  // Average nightly shortfall against what Whoop says he needed. This is the
  // number that explains a slow decline better than any single night does.
  const sleepDebt = useMemo(() => {
    if (!days) return null;
    const recent = days.slice(-7);
    const shortfalls = recent
      .filter(d => d.sleepHours != null && d.sleepNeededHours != null)
      .map(d => d.sleepNeededHours - d.sleepHours);
    return shortfalls.length ? mean(shortfalls) : null;
  }, [days]);

  if (loading && !days) {
    return <div className="whoop whoop--loading">Loading Whoop data...</div>;
  }
  if (error) {
    return <div className="whoop whoop--error">{error}</div>;
  }
  if (!days || days.length === 0) {
    return (
      <div className="whoop">
        <div className="whoop__head">
          <h3 className="whoop__title">Whoop</h3>
        </div>
        <p className="whoop__empty">
          No Whoop data in the last {rangeDays} days.
          {clientName ? ` ${clientName} may not have worn the strap.` : ''}
        </p>
      </div>
    );
  }

  const calibrating = days.some(d => d.calibrating);
  const clientOffset = dominantOffset(days);
  const awayFromDublin = clientOffset && clientOffset !== dublinOffsetNow();
  const axisTick = { fontSize: 11, fill: 'var(--color-slate)' };
  // Content is null on purpose: this keeps Recharts' synced cursor line on every
  // lane while suppressing four identical floating tooltips. DayInspector reads
  // the values instead.
  const tooltip = <Tooltip content={() => null} cursor={{ stroke: 'var(--color-slate)', strokeWidth: 1, strokeDasharray: '3 3' }} />;

  // Any lane can drive the inspector; they all share the same x values.
  const hoverProps = {
    onMouseMove: (state) => setHoverDate(state?.activeLabel || null),
    onMouseLeave: () => setHoverDate(null),
  };

  // At rest, show the most recent day that actually has a recovery score rather
  // than simply the last row. Today's row exists from the moment he wakes but
  // has no strain or recovery yet, so defaulting to it greeted the coach with a
  // column of dashes.
  const latestScored = [...days].reverse().find(d => d.recoveryScore != null);
  const inspectorDay = (hoverDate && dayMap[hoverDate]) || latestScored || days[days.length - 1] || null;

  // Dots help pick out individual days over a fortnight and turn into a smear
  // over three months.
  const showDots = rangeDays <= 30;

  // Only the bottom lane carries date labels. The others keep their axis for
  // alignment but hide the text, which buys vertical room for the charts.
  const hiddenAxis = (
    <XAxis dataKey="date" tick={false} axisLine={false} height={0} />
  );

  return (
    <div className="whoop">
      <div className="whoop__head">
        <h3 className="whoop__title">
          Recovery and sleep <span className="data-source">Whoop</span>
        </h3>

        <div className="whoop__range" role="group" aria-label="Date range">
          {RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              className={`whoop__range-btn${rangeDays === r.key ? ' whoop__range-btn--active' : ''}`}
              onClick={() => setRangeDays(r.key)}
              aria-pressed={rangeDays === r.key}
            >
              {r.label}
            </button>
          ))}
        </div>

        {awayFromDublin && (
          <span className="whoop__tz" title="Whoop reports each night in the timezone the client was in">
            Days are in {clientName ? `${clientName}'s` : "the client's"} local time (UTC{clientOffset})
          </span>
        )}

        {lastSyncAt && (
          <span className="whoop__synced">
            Updated {new Date(lastSyncAt).toLocaleString('en-IE', {
              timeZone: 'Europe/Dublin', day: 'numeric', month: 'short',
              hour: '2-digit', minute: '2-digit', hour12: false,
            })} (Dublin time)
          </span>
        )}
      </div>

      {calibrating && (
        <p className="whoop__calibrating">
          Days where Whoop was still calibrating the strap are left out. Its scores for
          those days are not meaningful.
        </p>
      )}

      {/* Direction, not averages: what has moved since last week */}
      {trends && (
        <div className="whoop__readouts">
          <Readout
            label="Recovery" unit="%" goodWhen="up"
            value={trends.recovery.recent != null ? Math.round(trends.recovery.recent) : null}
            trend={trends.recovery} stroke="var(--whoop-recovery)"
            series={days.map(d => d.recoveryScore)}
          />
          <Readout
            label="HRV" unit="ms" goodWhen="up"
            value={trends.hrv.recent != null ? Math.round(trends.hrv.recent) : null}
            trend={trends.hrv} stroke="var(--whoop-hrv)"
            series={days.map(d => d.hrv)}
          />
          <Readout
            label="Sleep" unit="h" goodWhen="up"
            value={trends.sleep.recent != null ? trends.sleep.recent.toFixed(1) : null}
            trend={trends.sleep} stroke="var(--whoop-rem)"
            series={days.map(d => d.sleepHours)}
            hint={sleepDebt != null && sleepDebt > 0
              ? `${hoursLabel(sleepDebt)} short of need, nightly`
              : sleepDebt != null ? 'Meeting his sleep need' : null}
          />
          <Readout
            label="Day strain" goodWhen="up"
            value={trends.strain.recent != null ? trends.strain.recent.toFixed(1) : null}
            trend={trends.strain} stroke="var(--whoop-strain)"
            series={days.map(d => d.strain)}
          />
          <Readout
            label="Resting HR" unit="bpm" goodWhen="down"
            value={trends.rhr.recent != null ? Math.round(trends.rhr.recent) : null}
            trend={trends.rhr} stroke="var(--whoop-rhr)"
            series={days.map(d => d.restingHR)}
          />
        </div>
      )}

      <DayInspector day={inspectorDay} hovering={Boolean(hoverDate && dayMap[hoverDate])} />

      {/* Four lanes, one shared time axis, one shared hover cursor */}
      <div className="whoop__lanes">

        <Lane
          title="Sleep"
          note={<>
            <span className="whoop__key"><i className="whoop__key-dot whoop__key-dot--deep" />Deep</span>
            <span className="whoop__key"><i className="whoop__key-dot whoop__key-dot--rem" />REM</span>
            <span className="whoop__key"><i className="whoop__key-dot whoop__key-dot--light" />Light</span>
            <span className="whoop__key"><i className="whoop__key-dash" />Needed</span>
          </>}
          height={190}
        >
          <ComposedChart data={chartData} syncId="whoop" margin={CHART_MARGIN} {...hoverProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            {hiddenAxis}
            <YAxis width={AXIS_WIDTH} tick={axisTick} tickFormatter={v => `${v}h`} domain={[0, 'auto']} />
            {tooltip}
            <Bar dataKey="deep" stackId="s" fill="var(--whoop-deep)" maxBarSize={26} isAnimationActive={false} />
            <Bar dataKey="rem" stackId="s" fill="var(--whoop-rem)" maxBarSize={26} isAnimationActive={false} />
            <Bar dataKey="light" stackId="s" fill="var(--whoop-light)" maxBarSize={26} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line
              type="monotone" dataKey="sleepNeededHours" dot={false}
              stroke="var(--color-slate)" strokeWidth={1.5} strokeDasharray="5 4"
              connectNulls={false} isAnimationActive={false}
            />
          </ComposedChart>
        </Lane>

        <Lane title="Recovery" note="Whoop's bands: green from 67, amber 34 to 66, red below." height={150}>
          <ComposedChart data={chartData} syncId="whoop" margin={CHART_MARGIN} {...hoverProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            {hiddenAxis}
            <YAxis width={AXIS_WIDTH} tick={axisTick} domain={[0, 100]} ticks={[0, 34, 67, 100]} tickFormatter={v => `${v}%`} />
            <ReferenceArea y1={0} y2={BAND_LOW} fill="var(--color-red)" fillOpacity={0.07} />
            <ReferenceArea y1={BAND_LOW} y2={BAND_HIGH} fill="var(--color-amber)" fillOpacity={0.07} />
            <ReferenceArea y1={BAND_HIGH} y2={100} fill="var(--color-green)" fillOpacity={0.07} />
            {tooltip}
            <Line
              type="monotone" dataKey="recoveryScore"
              stroke="var(--whoop-recovery)" strokeWidth={2}
              dot={showDots ? { r: 2.5, strokeWidth: 0, fill: 'var(--whoop-recovery)' } : false}
              activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false}
            />
          </ComposedChart>
        </Lane>

        <Lane
          title="HRV and resting heart rate"
          note="Read together. HRV falling while resting HR climbs is the clearest sign he is run down."
          height={150}
        >
          <ComposedChart data={chartData} syncId="whoop" margin={CHART_MARGIN} {...hoverProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            {hiddenAxis}
            <YAxis yAxisId="hrv" width={AXIS_WIDTH} tick={axisTick} domain={['auto', 'auto']} tickFormatter={v => `${v}`} />
            <YAxis yAxisId="rhr" orientation="right" width={34} tick={axisTick} domain={['auto', 'auto']} />
            {tooltip}
            <Line
              yAxisId="hrv" type="monotone" dataKey="hrv"
              stroke="var(--whoop-hrv)" strokeWidth={2} dot={false}
              connectNulls={false} isAnimationActive={false}
            />
            <Line
              yAxisId="rhr" type="monotone" dataKey="restingHR"
              stroke="var(--whoop-rhr)" strokeWidth={1.75} dot={false}
              connectNulls={false} isAnimationActive={false}
            />
          </ComposedChart>
        </Lane>

        <Lane title="Day strain" note="Bars are coloured by that morning's recovery, so hard days on a red body stand out." height={150}>
          <ComposedChart data={chartData} syncId="whoop" margin={{ ...CHART_MARGIN, bottom: 4 }} {...hoverProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="date" tick={axisTick} tickFormatter={fmtDay}
              minTickGap={18} height={22}
            />
            <YAxis width={AXIS_WIDTH} tick={axisTick} domain={[0, 21]} ticks={[0, 7, 14, 21]} />
            {/* 14 is roughly where Whoop calls a day strenuous. */}
            <ReferenceLine y={14} stroke="var(--color-slate)" strokeDasharray="4 4" strokeOpacity={0.6} />
            {tooltip}
            {/* Coloured by that morning's recovery, which is the coaching
                question this lane actually answers: was he pushing hard on days
                his body had not recovered? A uniform bar chart hides that
                entirely, because his strain barely varies. */}
            <Bar dataKey="strain" maxBarSize={26} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {chartData.map((d) => (
                <Cell key={d.date} fill={
                  d.recoveryScore == null ? 'var(--whoop-strain)'
                    : bandOf(d.recoveryScore) === 'low' ? 'var(--color-red)'
                    : bandOf(d.recoveryScore) === 'mid' ? 'var(--color-amber)'
                    : 'var(--color-green)'
                } />
              ))}
            </Bar>
          </ComposedChart>
        </Lane>
      </div>

      <p className="whoop__footnote">
        Hover any chart to read that whole day across all four. Steps stay on Trainerize:
        Whoop does not count them.
      </p>
    </div>
  );
}

export default WhoopPanel;
