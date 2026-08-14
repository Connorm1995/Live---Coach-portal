import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './ExerciseProgress.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

// States are named for what changed, not for whether it was good. Under
// autoregulation a lighter session is often the right call, so a reduction is
// styled as worth-a-look rather than as a failure.
const STATE_STYLE = {
  load_up:     { cls: 'up',      label: 'Load up' },
  reps_up:     { cls: 'up',      label: 'Reps up' },
  time_up:     { cls: 'up',      label: 'Time up' },
  assist_down: { cls: 'up',      label: 'Assistance down' },
  held:        { cls: 'held',    label: 'Held' },
  load_down:   { cls: 'down',    label: 'Load down' },
  reps_down:   { cls: 'down',    label: 'Reps down' },
  time_down:   { cls: 'down',    label: 'Time down' },
  assist_up:   { cls: 'down',    label: 'Assistance up' },
  not_comparable: { cls: 'none', label: 'Not comparable' },
};

const REASON_TEXT = {
  first_session: 'First session of this block',
  not_logged: 'Nothing was logged',
  no_weight_logged: 'No weight was logged',
  assistance_not_logged: 'Assistance was not logged',
  assistance_exceeds_bodyweight: 'Assistance logged above bodyweight',
  no_bodyweight_near_date: 'No weigh-in within a week',
  no_time_logged: 'No time was logged',
  no_reps_logged: 'No reps were logged',
  no_mode_set: 'No load type set',
};

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function primaryValue(point, mode) {
  if (mode === 'bodyweight_assisted') {
    return point.assistMin != null ? `${point.assistMin}kg assist` : null;
  }
  if (mode === 'bodyweight_added') {
    return point.addedMax != null
      ? (point.addedMax === 0 ? 'Bodyweight' : `+${point.addedMax}kg`)
      : null;
  }
  if (mode === 'timed') {
    return point.totalTime != null ? `${point.totalTime}s` : null;
  }
  if (mode === 'bodyweight' || mode === 'reps_only') {
    return point.totalReps != null ? `${point.totalReps} reps` : null;
  }
  return point.topLoad != null ? `${point.topLoad}kg` : null;
}

// ─── Setup: confirming how each movement is loaded ──────────────────

function ModeSetup({ clientId, onSaved, onClose }) {
  const [data, setData] = useState(null);
  const [choices, setChoices] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const fetchModes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/training/${clientId}/exercise-modes`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setData(json);
      // Only pre-select where being wrong is cheap. The bodyweight family is
      // left blank on purpose: pre-filling it would let one click accept a
      // hundred guesses, including the ones that invert the result, which is
      // the exact thing this panel exists to prevent.
      const seeded = {};
      for (const item of json.items) {
        if (item.mode) continue;
        if (item.signalCritical) continue;
        if (item.suggestion?.confidence !== 'high') continue;
        if (item.suggestion?.mode) seeded[item.exerciseName] = item.suggestion.mode;
      }
      setChoices(seeded);
    } catch (err) {
      setError('Could not load the exercise list');
    }
  }, [clientId]);

  useEffect(() => { fetchModes(); }, [fetchModes]);

  const visible = useMemo(() => {
    if (!data) return [];
    return showAll ? data.items : data.items.filter(i => !i.mode);
  }, [data, showAll]);

  const handleSave = async () => {
    const modes = Object.entries(choices)
      .filter(([, mode]) => mode)
      .map(([exerciseName, mode]) => ({ exerciseName, mode }));
    if (modes.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/training/${clientId}/exercise-modes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modes }),
      });
      if (!res.ok) throw new Error('Save failed');
      await fetchModes();
      if (onSaved) onSaved();
    } catch (err) {
      setError('Could not save. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <div className="exprog__loading">Loading exercise list...</div>;

  const pending = Object.keys(choices).length;

  return (
    <div className="exprog-setup">
      <div className="exprog-setup__head">
        <div>
          <h4 className="exprog-setup__title">How is each movement loaded?</h4>
          <p className="exprog-setup__blurb">
            On an assisted pull-up the logged number is the assistance, so the load is
            bodyweight minus it. On a weighted pull-up the same field is added load. Those
            two are opposite, so nothing is assumed from the name. Suggestions are
            pre-selected, but they need your confirmation before they count.
          </p>
        </div>
        {onClose && (
          <button className="exprog-setup__close" onClick={onClose} aria-label="Close setup">Done</button>
        )}
      </div>

      <div className="exprog-setup__counts">
        <span className="exprog-setup__count">{data.unsetCount} not set</span>
        {data.criticalUnsetCount > 0 && (
          <span className="exprog-setup__count exprog-setup__count--critical">
            {data.criticalUnsetCount} where a wrong answer flips the result
          </span>
        )}
        <button className="exprog-setup__toggle" onClick={() => setShowAll(s => !s)}>
          {showAll ? 'Show only unset' : 'Show all'}
        </button>
      </div>

      {error && <div className="exprog-setup__error">{error}</div>}

      <div className="exprog-setup__list">
        {visible.length === 0 && (
          <div className="exprog__empty">Every movement has a load type set.</div>
        )}
        {visible.map(item => (
          <div
            key={item.exerciseName}
            className={`exprog-setup__row${item.signalCritical ? ' exprog-setup__row--critical' : ''}`}
          >
            <div className="exprog-setup__info">
              <span className="exprog-setup__name">{item.exerciseName}</span>
              <span className="exprog-setup__meta">
                {item.logged} logged{item.notLogged > 0 ? `, ${item.notLogged} not logged` : ''}
                {item.weightIsIntermittent ? ', weight only sometimes' : ''}
                {item.shapeCount > 2 ? `, logged ${item.shapeCount} different ways` : ''}
              </span>
              {item.suggestion?.reason && !item.mode && (
                <span className={`exprog-setup__reason exprog-setup__reason--${item.suggestion.confidence}`}>
                  {item.suggestion.reason}
                </span>
              )}
            </div>
            <select
              className="exprog-setup__select"
              value={choices[item.exerciseName] || item.mode || ''}
              onChange={(e) => setChoices(c => ({ ...c, [item.exerciseName]: e.target.value }))}
            >
              <option value="">Not set</option>
              {data.modes.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="exprog-setup__actions">
        <button
          className="exprog-setup__save"
          onClick={handleSave}
          disabled={saving || pending === 0}
        >
          {saving ? 'Saving...' : `Save ${pending} ${pending === 1 ? 'answer' : 'answers'}`}
        </button>
      </div>
    </div>
  );
}

// ─── One exercise ───────────────────────────────────────────────────

function ExerciseCard({ ex }) {
  const recent = ex.points.filter(p => p.logged).slice(-8);
  const latestStyle = STATE_STYLE[ex.latest?.state] || STATE_STYLE.not_comparable;
  const seriesRef = useRef(null);

  // The strip is wider than the card, and the sessions worth looking at are the
  // recent ones the summary above is describing. Left alone it opens on the
  // oldest, which is the opposite of what is being talked about.
  useEffect(() => {
    const el = seriesRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [ex]);

  return (
    <div className="exprog-card">
      <div className="exprog-card__head">
        <div className="exprog-card__title-wrap">
          <span className="exprog-card__name">{ex.exerciseName}</span>
          <span className="exprog-card__mode">{ex.modeLabel}</span>
        </div>
        <span className={`exprog-card__state exprog-card__state--${latestStyle.cls}`}>
          {latestStyle.label}
        </span>
      </div>

      <p className="exprog-card__summary">
        {ex.latest?.summary
          || REASON_TEXT[ex.latest?.reason]
          || 'Nothing to compare yet'}
      </p>

      {ex.latest?.longGap && (
        <span className="exprog-card__flag">
          Compared across a {ex.latest.gapDays} day gap, so this is not a week-on-week move
        </span>
      )}

      <div className="exprog-card__series" ref={seriesRef}>
        {recent.map((p, i) => {
          const s = STATE_STYLE[p.state] || STATE_STYLE.not_comparable;
          const val = primaryValue(p, ex.mode);
          return (
            <div key={i} className={`exprog-chip exprog-chip--${s.cls}`}>
              <span className="exprog-chip__date">{fmtDate(p.date)}</span>
              <span className="exprog-chip__value">{val || '-'}</span>
              {p.repsAtTopLoad != null && ex.mode !== 'timed' && ex.mode !== 'bodyweight' && ex.mode !== 'reps_only' && (
                <span className="exprog-chip__sub">{p.repsAtTopLoad} reps</span>
              )}
              {p.bodyweightKg != null && (ex.mode === 'bodyweight' || ex.mode === 'bodyweight_added' || ex.mode === 'bodyweight_assisted') && (
                <span className="exprog-chip__sub">{p.bodyweightKg}kg bw</span>
              )}
            </div>
          );
        })}
      </div>

      {ex.skippedSessions > 0 && (
        <span className="exprog-card__note">
          {ex.skippedSessions} {ex.skippedSessions === 1 ? 'session' : 'sessions'} where it was
          programmed but nothing was logged
        </span>
      )}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────

function ExerciseProgress({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const fetchProgression = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/training/${clientId}/progression`);
      if (!res.ok) throw new Error('Failed to load progression');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Progression fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchProgression(); }, [fetchProgression]);

  if (loading) {
    return (
      <div className="training-section">
        <h3 className="training-section__title">Progression</h3>
        <div className="exprog__loading">Loading progression...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="training-section">
        <h3 className="training-section__title">Progression</h3>
        <div className="exprog__empty">Could not load progression</div>
      </div>
    );
  }

  const exercises = data?.exercises || [];
  const needsMode = data?.needsMode || [];

  return (
    <div className="training-section">
      <div className="training-section__header">
        <h3 className="training-section__title" style={{ marginBottom: 0 }}>
          Progression
          <span className="data-source">Trainerize</span>
        </h3>
        <button className="exprog__setup-btn" onClick={() => setSetupOpen(o => !o)}>
          {setupOpen ? 'Hide setup' : `Load types${needsMode.length ? ` (${needsMode.length} unset)` : ''}`}
        </button>
      </div>

      {setupOpen && (
        <ModeSetup
          clientId={clientId}
          onSaved={fetchProgression}
          onClose={() => setSetupOpen(false)}
        />
      )}

      {!setupOpen && needsMode.length > 0 && (
        <div className="exprog__prompt">
          <span>
            {needsMode.length} {needsMode.length === 1 ? 'movement has' : 'movements have'} no load
            type set, so {needsMode.length === 1 ? 'it is' : 'they are'} left out rather than guessed at.
          </span>
          <button className="exprog__prompt-btn" onClick={() => setSetupOpen(true)}>Set them</button>
        </div>
      )}

      {exercises.length === 0 ? (
        <div className="exprog__empty">
          No movements have a load type set yet. Set them above and progression appears here.
        </div>
      ) : (
        <div className="exprog__grid">
          {exercises.map(ex => <ExerciseCard key={ex.exerciseName} ex={ex} />)}
        </div>
      )}
    </div>
  );
}

export default ExerciseProgress;
