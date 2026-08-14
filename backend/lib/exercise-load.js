/**
 * exercise-load.js
 *
 * Puts every movement on one load scale so progress can be read like for like.
 *
 * The problem this solves: the portal used to read progress off `weight x reps`.
 * That is wrong or meaningless for most of what is actually in the programs.
 * Bodyweight work logs no weight, so it scored zero. Assisted movements log the
 * ASSISTANCE in the weight field, so reducing assistance - which is the whole
 * point - read as a volume drop and coloured red. Loaded carries log time and
 * weight with no reps, so they scored zero too.
 *
 * The fix is arithmetic, not modelling. If the load a movement is performed
 * against is known, every variant sits on the same kilogram scale:
 *
 *   pull-up            load = bodyweight
 *   weighted pull-up   load = bodyweight + logged weight
 *   assisted pull-up   load = bodyweight - logged weight
 *   barbell row        load = logged weight
 *
 * What it will NOT do is guess which of those a given exercise is. "Assisted
 * pull up" and "Weighted pull up" put a number in the same field with opposite
 * meaning, so inferring from the name would invert the progress signal on the
 * exact movements where it matters most. Mode is set by the coach. Until it is
 * set, the load is reported as unresolved with a reason, never assumed.
 */

// --- Modes -----------------------------------------------------------------

const MODES = {
  // Load is the number logged in the weight field.
  EXTERNAL: 'external',
  // Load is the client's bodyweight (pull-up, push-up, dip, inverted row).
  BODYWEIGHT: 'bodyweight',
  // Load is bodyweight plus the logged weight (dip belt, weight vest).
  BODYWEIGHT_ADDED: 'bodyweight_added',
  // Load is bodyweight minus the logged weight (assist machine, band).
  BODYWEIGHT_ASSISTED: 'bodyweight_assisted',
  // Reps are the whole story. Bodyweight is not a meaningful load here
  // (dead bugs, bird dogs, stir the pot), so no kilogram figure is produced.
  REPS_ONLY: 'reps_only',
  // Duration is the measure (unloaded planks and holds).
  TIMED: 'timed',
  // Duration under load (carries). Both matter, neither alone is progress.
  TIMED_LOADED: 'timed_loaded',
  // Distance/time/pace work. Not strength progression.
  CARDIO: 'cardio',
  // Warm-ups, mobility, prep, rest. Excluded from progression entirely.
  IGNORE: 'ignore',
};

const ALL_MODES = Object.values(MODES);

// Modes where mistaking one for another flips the direction of progress.
// These are the ones worth making the coach confirm first.
const SIGNAL_CRITICAL = [MODES.BODYWEIGHT_ADDED, MODES.BODYWEIGHT_ASSISTED];

const MODE_LABELS = {
  [MODES.EXTERNAL]: 'External load',
  [MODES.BODYWEIGHT]: 'Bodyweight',
  [MODES.BODYWEIGHT_ADDED]: 'Bodyweight + added',
  [MODES.BODYWEIGHT_ASSISTED]: 'Bodyweight - assistance',
  [MODES.REPS_ONLY]: 'Reps only',
  [MODES.TIMED]: 'Timed',
  [MODES.TIMED_LOADED]: 'Timed under load',
  [MODES.CARDIO]: 'Cardio',
  [MODES.IGNORE]: 'Not tracked',
};

// --- Per-set load resolution -----------------------------------------------

const UNRESOLVED = {
  NO_MODE: 'no_mode_set',
  NO_BODYWEIGHT: 'no_bodyweight_near_date',
  NO_WEIGHT_LOGGED: 'no_weight_logged',
  ASSISTANCE_NOT_LOGGED: 'assistance_not_logged',
  ASSISTANCE_EXCEEDS_BODYWEIGHT: 'assistance_exceeds_bodyweight',
  NOT_A_LOAD_MODE: 'not_a_load_mode',
};

function num(v) {
  return (v == null || v === '' || Number.isNaN(Number(v))) ? null : Number(v);
}

/**
 * Effective load for one logged set.
 *
 * Returns { load, reps, timeSec, distance, resolved, reason }. `load` is only
 * ever a number when it is genuinely known - there is no fallback value.
 */
function resolveSetLoad({ mode, set, bodyweightKg }) {
  const reps = num(set?.reps);
  const timeSec = num(set?.time);
  const distance = num(set?.distance);
  const weight = num(set?.weight);
  const bw = num(bodyweightKg);

  const base = { load: null, reps, timeSec, distance, resolved: false, reason: null };

  if (!mode) return { ...base, reason: UNRESOLVED.NO_MODE };

  switch (mode) {
    case MODES.EXTERNAL:
      if (weight == null || weight === 0) {
        return { ...base, reason: UNRESOLVED.NO_WEIGHT_LOGGED };
      }
      return { ...base, load: weight, resolved: true };

    case MODES.BODYWEIGHT:
      if (bw == null) return { ...base, reason: UNRESOLVED.NO_BODYWEIGHT };
      return { ...base, load: bw, resolved: true };

    case MODES.BODYWEIGHT_ADDED: {
      if (bw == null) return { ...base, reason: UNRESOLVED.NO_BODYWEIGHT };
      // No added weight logged genuinely means bodyweight only here: the same
      // exercise name covers both the loaded and unloaded version, and a client
      // doing a plain chin-up has nothing to enter. Defaulting to zero is the
      // correct reading, and it merges the two into one comparable series.
      const added = weight == null ? 0 : weight;
      return { ...base, load: Number((bw + added).toFixed(2)), resolved: true };
    }

    case MODES.BODYWEIGHT_ASSISTED: {
      if (bw == null) return { ...base, reason: UNRESOLVED.NO_BODYWEIGHT };
      // Unlike added weight, a missing number here cannot be read as zero. Zero
      // assistance means they were not using the machine or band at all, which
      // would have been logged as the plain movement. A blank is a gap in the
      // logging, and assuming zero would overstate the load by the full stack.
      if (weight == null || weight === 0) {
        return { ...base, reason: UNRESOLVED.ASSISTANCE_NOT_LOGGED };
      }
      const load = bw - weight;
      if (load <= 0) {
        // Assistance at or above bodyweight is not physically meaningful. Left
        // unresolved so it shows up as a data problem rather than a negative.
        return { ...base, reason: UNRESOLVED.ASSISTANCE_EXCEEDS_BODYWEIGHT };
      }
      return { ...base, load: Number(load.toFixed(2)), resolved: true };
    }

    case MODES.TIMED_LOADED:
      if (weight == null || weight === 0) {
        return { ...base, reason: UNRESOLVED.NO_WEIGHT_LOGGED };
      }
      // Duration is carried alongside; a carry progresses on either.
      return { ...base, load: weight, resolved: true };

    case MODES.REPS_ONLY:
    case MODES.TIMED:
    case MODES.CARDIO:
    case MODES.IGNORE:
      return { ...base, reason: UNRESOLVED.NOT_A_LOAD_MODE };

    default:
      return { ...base, reason: UNRESOLVED.NO_MODE };
  }
}

// --- Bodyweight lookup ------------------------------------------------------

const BODYWEIGHT_MAX_GAP_DAYS = 7;

/**
 * Nearest logged bodyweight to a date, within a hard window.
 *
 * `entries` is [{ date: 'YYYY-MM-DD', weight: number }] in any order. Beyond the
 * window this returns null rather than reaching further back: a weigh-in from a
 * month ago is not the load they lifted under, and quietly using it would put a
 * fake number on every bodyweight movement.
 */
function bodyweightOn(dateStr, entries, maxGapDays = BODYWEIGHT_MAX_GAP_DAYS) {
  if (!dateStr || !Array.isArray(entries) || entries.length === 0) return null;
  const target = new Date(dateStr + 'T12:00:00Z').getTime();
  if (Number.isNaN(target)) return null;

  let best = null;
  let bestGap = Infinity;
  for (const e of entries) {
    const w = num(e.weight);
    if (w == null || w <= 0) continue;
    const t = new Date(e.date + 'T12:00:00Z').getTime();
    if (Number.isNaN(t)) continue;
    const gapDays = Math.abs(t - target) / 86400000;
    if (gapDays <= maxGapDays && gapDays < bestGap) {
      bestGap = gapDays;
      best = w;
    }
  }
  return best;
}

// --- History-based shape classification ------------------------------------

/**
 * What shape is this exercise actually logged in, across its whole history?
 *
 * The old code decided an exercise's type from the first session it happened to
 * load and could only ever move from bodyweight to weighted, never back. With
 * Plank logged six different ways and chin-ups logged both with and without a
 * belt, that meant one arbitrary session set the rule for hundreds of others.
 * This looks at everything before deciding.
 *
 * `instances` is [{ recordType, stats: [...] }].
 */
function summariseExerciseShapes(instances) {
  const shapes = new Map();
  const recordTypes = new Set();
  let withWeight = 0;
  let withoutWeight = 0;
  let withTime = 0;
  let withReps = 0;
  let withDistance = 0;
  let empty = 0;
  let total = 0;

  for (const inst of (instances || [])) {
    total++;
    if (inst.recordType) recordTypes.add(inst.recordType);
    const stats = inst.stats || [];

    let hasW = false, hasR = false, hasT = false, hasD = false;
    for (const s of stats) {
      if (num(s.weight) > 0) hasW = true;
      if (num(s.reps) > 0) hasR = true;
      if (num(s.time) > 0) hasT = true;
      if (num(s.distance) > 0) hasD = true;
    }

    const key = [hasR && 'reps', hasW && 'weight', hasT && 'time', hasD && 'distance']
      .filter(Boolean).sort().join('+') || 'empty';
    shapes.set(key, (shapes.get(key) || 0) + 1);

    if (key === 'empty') empty++;
    if (hasW) withWeight++; else if (key !== 'empty') withoutWeight++;
    if (hasT) withTime++;
    if (hasR) withReps++;
    if (hasD) withDistance++;
  }

  const ranked = [...shapes.entries()].sort((a, b) => b[1] - a[1]);
  const logged = total - empty;

  return {
    total,
    logged,
    empty,
    shapes: Object.fromEntries(ranked),
    dominantShape: ranked[0]?.[0] || 'empty',
    shapeCount: ranked.length,
    recordTypes: [...recordTypes],
    withWeight,
    withoutWeight,
    withTime,
    withReps,
    withDistance,
    // Sometimes-weighted is the signature of a movement used both loaded and
    // unloaded, which is exactly where the old one-way switch went wrong.
    weightIsIntermittent: withWeight > 0 && withoutWeight > 0,
  };
}

// --- Mode suggestion (a suggestion, never a decision) -----------------------

const ASSIST_PATTERN = /\bassist(ed|ance)?\b/i;
const BAND_PATTERN = /\bband(ed)?\b/i;
const BODYWEIGHT_MOVEMENT = /\b(pull ?ups?|chin ?ups?|push ?ups?|press ?ups?|dips?|inverted rows?|muscle ?ups?|pistol squats?|nordics?|hanging|chin ?up|pull ?up)\b/i;

/**
 * Best guess at a mode, with an explicit confidence and reason.
 *
 * Never applied automatically. The whole point of the mode is to disambiguate
 * cases a name cannot settle, so this exists to order the coach's queue and
 * pre-select a dropdown, not to decide anything.
 */
function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function suggestMode(name, summary) {
  const n = name || '';
  const rt = summary?.recordTypes || [];
  const s = summary || {};

  const out = (mode, confidence, reason) => ({ mode, confidence, reason });

  if (rt.includes('rest')) return out(MODES.IGNORE, 'high', 'Logged as rest');
  if (rt.includes('general') && !s.withWeight && !s.withReps) {
    return out(MODES.IGNORE, 'high', 'General prep with nothing logged');
  }
  if (rt.includes('cardio')) return out(MODES.CARDIO, 'high', 'Trainerize record type is cardio');

  // Assisted comes before everything else: if this is wrong the progress signal
  // points the wrong way, so it must be surfaced even at low confidence.
  if (ASSIST_PATTERN.test(n)) {
    return out(MODES.BODYWEIGHT_ASSISTED, 'medium',
      'Name says assisted, so the logged weight is most likely assistance. Confirm before this is used.');
  }
  if (BAND_PATTERN.test(n) && BODYWEIGHT_MOVEMENT.test(n)) {
    return out(MODES.BODYWEIGHT_ASSISTED, 'low',
      'A band on a pull-up is usually assistance, but bands add resistance on other movements. Confirm.');
  }

  if (s.withTime > 0 && s.withWeight > 0) {
    return out(MODES.TIMED_LOADED, 'medium', 'Logs both time and weight, which reads as a loaded carry or hold');
  }
  if (s.withTime > 0 && s.withWeight === 0 && s.withReps === 0) {
    return out(MODES.TIMED, 'high', 'Only ever logs time');
  }

  if (BODYWEIGHT_MOVEMENT.test(n)) {
    if (s.weightIsIntermittent) {
      return out(MODES.BODYWEIGHT_ADDED, 'medium',
        `Bodyweight movement logged with weight ${plural(s.withWeight, 'time')} and without ${plural(s.withoutWeight, 'time')}, which reads as added load`);
    }
    return out(MODES.BODYWEIGHT, 'high', 'Bodyweight movement with no weight ever logged');
  }

  if (s.withWeight > 0 && s.withoutWeight === 0) {
    return out(MODES.EXTERNAL, 'high', 'Always logged with a weight');
  }
  if (s.withWeight > 0 && s.weightIsIntermittent) {
    return out(MODES.EXTERNAL, 'low',
      `Usually weighted but logged without weight ${plural(s.withoutWeight, 'time')}. Could be a logging gap.`);
  }
  if (s.withReps > 0 && s.withWeight === 0) {
    return out(MODES.REPS_ONLY, 'medium',
      'Reps only, and the name does not read as a movement loaded by bodyweight');
  }
  if (s.logged === 0) {
    return out(MODES.IGNORE, 'medium', 'Nothing has ever been logged against it');
  }

  return out(null, 'none', 'Not enough of a pattern to suggest anything');
}

module.exports = {
  MODES,
  ALL_MODES,
  MODE_LABELS,
  SIGNAL_CRITICAL,
  UNRESOLVED,
  BODYWEIGHT_MAX_GAP_DAYS,
  resolveSetLoad,
  bodyweightOn,
  summariseExerciseShapes,
  suggestMode,
};
