/**
 * exercise-progress.js
 *
 * Compares one session of an exercise against the previous one, like for like.
 *
 * Two rules run through all of this.
 *
 * 1. Compare the variable the coach actually moved. On a barbell row that is the
 *    weight. On a pull-up it is reps, because bodyweight drifts on its own and
 *    calling a 0.4kg weigh-in change "load down" would be noise dressed up as a
 *    finding. On an assisted pull-up it is the assistance, going down. Each mode
 *    therefore declares its own primary variable rather than everything being
 *    forced through one number.
 *
 * 2. Say "not comparable" when that is the truth. Sessions with nothing
 *    resolvable, or a first session with no predecessor, produce no verdict. An
 *    honest gap is more useful than a confident guess, which is what the old
 *    green/amber/red on raw tonnage was.
 *
 * Down is not failure. Under autoregulation a lighter session is often the right
 * call, so states are named for what changed, not for whether it was good, and
 * the UI colours a reduction as worth-a-look rather than as a problem.
 */

const { MODES, resolveSetLoad } = require('./exercise-load');

// --- States ----------------------------------------------------------------

const STATES = {
  LOAD_UP: 'load_up',
  LOAD_DOWN: 'load_down',
  REPS_UP: 'reps_up',
  REPS_DOWN: 'reps_down',
  TIME_UP: 'time_up',
  TIME_DOWN: 'time_down',
  ASSIST_DOWN: 'assist_down',   // less assistance needed, a progression
  ASSIST_UP: 'assist_up',
  HELD: 'held',
  NOT_COMPARABLE: 'not_comparable',
};

// Which variable each mode progresses on, and which way is forward.
const PRIMARY = {
  [MODES.EXTERNAL]:            { key: 'topLoad',    label: 'Load',       unit: 'kg', forward: 'up' },
  [MODES.BODYWEIGHT]:          { key: 'totalReps',  label: 'Reps',       unit: '',   forward: 'up' },
  [MODES.BODYWEIGHT_ADDED]:    { key: 'addedMax',   label: 'Added load', unit: 'kg', forward: 'up' },
  [MODES.BODYWEIGHT_ASSISTED]: { key: 'assistMin',  label: 'Assistance', unit: 'kg', forward: 'down' },
  [MODES.REPS_ONLY]:           { key: 'totalReps',  label: 'Reps',       unit: '',   forward: 'up' },
  [MODES.TIMED]:               { key: 'totalTime',  label: 'Time',       unit: 's',  forward: 'up' },
  [MODES.TIMED_LOADED]:        { key: 'topLoad',    label: 'Load',       unit: 'kg', forward: 'up' },
};

function n(v) { return (v == null || Number.isNaN(v)) ? null : Number(v); }

// --- Session metrics -------------------------------------------------------

/**
 * Reduce one logged instance of an exercise to the handful of numbers a
 * comparison needs. Unresolvable sets are counted, not silently dropped, so the
 * caller can tell a genuinely light session from a badly logged one.
 */
function sessionMetrics({ mode, stats, bodyweightKg, date }) {
  const sets = [];
  const unresolved = [];

  for (const s of (stats || [])) {
    const r = resolveSetLoad({ mode, set: s, bodyweightKg });
    if (r.resolved) sets.push({ ...r, rawWeight: n(s.weight) });
    else unresolved.push({ reason: r.reason, reps: r.reps, timeSec: r.timeSec, rawWeight: n(s.weight) });
  }

  // Reps and time are readable even where load is not, so they are gathered
  // from every set rather than only the resolved ones.
  const allReps = (stats || []).map(s => n(s.reps)).filter(v => v != null && v > 0);
  const allTime = (stats || []).map(s => n(s.time)).filter(v => v != null && v > 0);
  const rawWeights = (stats || []).map(s => n(s.weight)).filter(v => v != null && v > 0);

  const loads = sets.map(s => s.load).filter(v => v != null);
  const topLoad = loads.length ? Math.max(...loads) : null;

  // Reps done at the heaviest load in the session, which is what "3 sets of 8
  // at 100kg went to 3 sets of 10" actually means.
  let repsAtTopLoad = null;
  if (topLoad != null) {
    const at = sets.filter(s => s.load === topLoad && s.reps != null);
    if (at.length) repsAtTopLoad = at.reduce((sum, s) => sum + s.reps, 0);
  }

  // An exercise that appears in the workout with nothing recorded against it was
  // not performed. It is not a light session, and treating it as one would both
  // invent a regression and break the chain between the sessions either side.
  const hasAnyData = allReps.length > 0 || allTime.length > 0 || rawWeights.length > 0
    || (stats || []).some(s => n(s.distance) > 0);

  // The deliberate adjustment on bodyweight-family movements. Added load is read
  // at its heaviest, assistance at its lightest, because those are the hardest
  // set in each case. Added load has a real zero - a plain chin-up is nothing
  // added - so a session with reps but no weight is 0, not unknown. Assistance
  // has no such zero, since nobody uses an assist machine with no assistance.
  let addedMax = rawWeights.length ? Math.max(...rawWeights) : null;
  if (mode === MODES.BODYWEIGHT_ADDED && addedMax == null && allReps.length > 0) {
    addedMax = 0;
  }

  return {
    date: date || null,
    setCount: (stats || []).length,
    resolvedCount: sets.length,
    unresolvedCount: unresolved.length,
    unresolvedReasons: [...new Set(unresolved.map(u => u.reason))],
    hasAnyData,
    topLoad,
    repsAtTopLoad,
    totalReps: allReps.length ? allReps.reduce((a, b) => a + b, 0) : null,
    totalTime: allTime.length ? allTime.reduce((a, b) => a + b, 0) : null,
    addedMax,
    assistMin: rawWeights.length ? Math.min(...rawWeights) : null,
    bodyweightKg: n(bodyweightKg),
    sets: sets.map(s => ({ load: s.load, reps: s.reps, timeSec: s.timeSec, rawWeight: s.rawWeight })),
  };
}

// --- Comparison ------------------------------------------------------------

function fmtNum(v, unit) {
  if (v == null) return '-';
  const rounded = Math.abs(v % 1) < 0.05 ? Math.round(v) : Number(v.toFixed(1));
  return unit ? `${rounded}${unit}` : `${rounded}`;
}

function stateFor(mode, delta, forward) {
  if (delta === 0) return STATES.HELD;
  const improved = forward === 'up' ? delta > 0 : delta < 0;

  switch (mode) {
    case MODES.BODYWEIGHT_ASSISTED:
      return improved ? STATES.ASSIST_DOWN : STATES.ASSIST_UP;
    case MODES.BODYWEIGHT:
    case MODES.REPS_ONLY:
      return delta > 0 ? STATES.REPS_UP : STATES.REPS_DOWN;
    case MODES.TIMED:
      return delta > 0 ? STATES.TIME_UP : STATES.TIME_DOWN;
    default:
      return delta > 0 ? STATES.LOAD_UP : STATES.LOAD_DOWN;
  }
}

/**
 * Compare two sessions of the same exercise.
 *
 * Returns a verdict naming the variable compared and the numbers behind it, or
 * NOT_COMPARABLE with a reason. Never returns a verdict it cannot show working
 * for.
 */
function compareSessions({ mode, current, previous }) {
  const spec = PRIMARY[mode];
  const nothing = (reason) => ({
    state: STATES.NOT_COMPARABLE, basis: null, reason,
    primary: null, secondary: null, summary: null,
  });

  if (!spec) return nothing('mode_has_no_progression');
  if (!current) return nothing('no_current_session');
  if (!previous) return nothing('no_previous_session');

  const currVal = n(current[spec.key]);
  const prevVal = n(previous[spec.key]);

  if (currVal == null || prevVal == null) {
    // Falling back to a different variable here would compare two different
    // things and label it progress, so it stops instead. The reason names the
    // variable that was actually missing rather than a load-resolution code,
    // which read as nonsense on timed and reps-only movements.
    const missingSide = currVal == null ? current : previous;
    let reason;
    if (spec.key === 'totalTime') reason = 'no_time_logged';
    else if (spec.key === 'totalReps') reason = 'no_reps_logged';
    else if (missingSide.unresolvedReasons.length) reason = missingSide.unresolvedReasons[0];
    else reason = `no_${spec.key}`;
    return nothing(reason);
  }

  const delta = Number((currVal - prevVal).toFixed(2));
  let state = stateFor(mode, delta, spec.forward);

  // Where the headline variable held, reps are the tie-break: holding load and
  // adding reps is the ordinary way a block moves forward.
  let secondary = null;
  if (state === STATES.HELD && spec.key !== 'totalReps') {
    const cReps = n(current.repsAtTopLoad) ?? n(current.totalReps);
    const pReps = n(previous.repsAtTopLoad) ?? n(previous.totalReps);
    if (cReps != null && pReps != null && cReps !== pReps) {
      state = cReps > pReps ? STATES.REPS_UP : STATES.REPS_DOWN;
      secondary = { label: 'Reps', curr: cReps, prev: pReps, delta: cReps - pReps, unit: '' };
    } else if (cReps != null && pReps != null) {
      secondary = { label: 'Reps', curr: cReps, prev: pReps, delta: 0, unit: '' };
    }
  }

  const primary = {
    label: spec.label, unit: spec.unit,
    curr: currVal, prev: prevVal, delta,
  };

  // Bodyweight is context on the bodyweight family: the same rep count at a
  // lighter bodyweight is a different achievement, and worth saying out loud.
  let context = null;
  if (mode === MODES.BODYWEIGHT || mode === MODES.BODYWEIGHT_ADDED || mode === MODES.BODYWEIGHT_ASSISTED) {
    if (current.bodyweightKg != null && previous.bodyweightKg != null) {
      context = {
        label: 'Bodyweight',
        curr: current.bodyweightKg,
        prev: previous.bodyweightKg,
        delta: Number((current.bodyweightKg - previous.bodyweightKg).toFixed(1)),
        unit: 'kg',
      };
    }
  }

  return {
    state,
    basis: spec.key,
    reason: null,
    primary,
    secondary,
    context,
    summary: buildSummary({ mode, state, primary, secondary, context, current, previous }),
  };
}

function buildSummary({ mode, state, primary, secondary, context, current, previous }) {
  const u = primary.unit;
  const from = `${fmtNum(primary.prev, u)} to ${fmtNum(primary.curr, u)}`;

  let head;
  switch (state) {
    case STATES.HELD:
      head = `${primary.label} held at ${fmtNum(primary.curr, u)}`;
      break;
    case STATES.ASSIST_DOWN:
      head = `Assistance down, ${from}`;
      break;
    case STATES.ASSIST_UP:
      head = `Assistance up, ${from}`;
      break;
    case STATES.REPS_UP:
    case STATES.REPS_DOWN:
      if (secondary) {
        head = `${primary.label} held at ${fmtNum(primary.curr, u)}, reps ${secondary.prev} to ${secondary.curr}`;
      } else {
        head = `Reps ${from}`;
      }
      break;
    default:
      head = `${primary.label} ${primary.delta > 0 ? 'up' : 'down'}, ${from}`;
  }

  const parts = [head];

  // Set and rep shape, so a load jump that cost reps is visible rather than
  // hidden behind a single green arrow.
  if (mode !== MODES.TIMED && current.repsAtTopLoad != null && previous.repsAtTopLoad != null
      && state !== STATES.REPS_UP && state !== STATES.REPS_DOWN) {
    if (current.repsAtTopLoad !== previous.repsAtTopLoad) {
      parts.push(`reps at top load ${previous.repsAtTopLoad} to ${current.repsAtTopLoad}`);
    }
  }

  if (context && context.delta !== 0) {
    parts.push(`bodyweight ${context.delta > 0 ? 'up' : 'down'} ${fmtNum(Math.abs(context.delta), 'kg')}`);
  }

  return parts.join(', ');
}

// Beyond this the two sessions are not really consecutive. They are still
// compared, because the numbers are real, but flagged so a comeback session
// after a holiday is not read as a week-on-week regression.
const LONG_GAP_DAYS = 21;

function daysBetween(a, b) {
  if (!a || !b) return null;
  const t1 = new Date(a + 'T12:00:00Z').getTime();
  const t2 = new Date(b + 'T12:00:00Z').getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round(Math.abs(t2 - t1) / 86400000);
}

/**
 * Walk an exercise's sessions in order and compare each to the previous one that
 * was actually performed. `instances` must be chronological.
 *
 * Sessions where the exercise appears but nothing was logged are kept in the
 * series marked `logged: false`, so they can be reported as skipped, but they
 * are stepped over when comparing. Otherwise one blank week would produce a
 * false regression and then a false gain the week after.
 */
function buildProgressSeries({ mode, instances, bodyweightFor }) {
  const points = [];
  for (const inst of (instances || [])) {
    const bw = bodyweightFor ? bodyweightFor(inst.date) : null;
    const metrics = sessionMetrics({ mode, stats: inst.stats, bodyweightKg: bw, date: inst.date });
    points.push({
      date: inst.date,
      workoutId: inst.workoutId || null,
      logged: metrics.hasAnyData,
      metrics,
    });
  }

  let lastLogged = null;
  for (const point of points) {
    if (!point.logged) {
      point.comparison = {
        state: STATES.NOT_COMPARABLE, basis: null, reason: 'not_logged',
        primary: null, secondary: null, summary: null,
      };
      continue;
    }

    if (!lastLogged) {
      point.comparison = {
        state: STATES.NOT_COMPARABLE, basis: null, reason: 'first_session',
        primary: null, secondary: null, summary: null,
      };
    } else {
      const gap = daysBetween(lastLogged.date, point.date);
      point.comparison = {
        ...compareSessions({ mode, current: point.metrics, previous: lastLogged.metrics }),
        comparedTo: lastLogged.date,
        gapDays: gap,
        longGap: gap != null && gap > LONG_GAP_DAYS,
      };
    }
    lastLogged = point;
  }

  return points;
}

module.exports = {
  STATES,
  PRIMARY,
  sessionMetrics,
  compareSessions,
  buildProgressSeries,
};
