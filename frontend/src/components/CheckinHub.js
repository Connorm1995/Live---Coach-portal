import React, { useState, useEffect, useCallback, useRef } from 'react';
import './CheckinHub.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'weekly', label: 'Check-ins' },
  { key: 'eom', label: 'Reports' },
];

const SUB_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'done', label: 'Done' },
  { key: 'notSubmitted', label: 'Not Submitted' },
];

// A click on "Mark done" this soon after the confirmation opened is ignored, so
// a double-click on a row's Done button can never confirm by itself.
const CONFIRM_ARM_MS = 400;

// How long the "moved to Done" note, and the Undo on it, stays up.
const NOTICE_MS = 8000;

function formatProgram(program) {
  if (program === 'my_fit_coach') return 'My Fit Coach';
  if (program === 'my_fit_coach_core') return 'MFC Core';
  return program;
}

function formatType(type) {
  if (type === 'weekly') return 'Check-in';
  if (type === 'eom_report') return 'EOM Report';
  return type;
}

function typeNoun(type) {
  return type === 'eom_report' ? 'EOM report' : 'check-in';
}

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0];
}

function bySubmittedDesc(a, b) {
  return new Date(b.submittedAt) - new Date(a.submittedAt);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CheckinHub({ isOpen, onClose, onSelectClient }) {
  const [filter, setFilter] = useState('all');
  const [subTab, setSubTab] = useState('pending');
  const [data, setData] = useState({ pending: [], done: [], notSubmitted: [], cycleClosed: false, cycleStart: null });
  const [loading, setLoading] = useState(false);
  // Marking a check-in done without a Loom takes two clicks in two different
  // places: the row's Done button opens a confirmation in the row, and only
  // that confirmation's Mark done button saves anything.
  const [confirmingId, setConfirmingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [notice, setNotice] = useState(null); // { text, undoId?, error? }
  const confirmOpenedAt = useRef(0);
  const cancelRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/checkins/hub?filter=${filter}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch check-in hub data:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  // A confirmation or a note belongs to the list it was opened on.
  useEffect(() => {
    setConfirmingId(null);
    setNotice(null);
  }, [isOpen, filter, subTab]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Focus Cancel rather than Mark done, so a second press of Enter backs out
  // instead of saving.
  useEffect(() => {
    if (confirmingId) cancelRef.current?.focus();
  }, [confirmingId]);

  // Escape backs out of an open confirmation first, and only then closes the hub.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key !== 'Escape') return;
      if (savingId) return;
      if (confirmingId) {
        setConfirmingId(null);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, confirmingId, savingId]);

  const openConfirm = (e, checkinId) => {
    e.stopPropagation();
    if (savingId) return;
    confirmOpenedAt.current = Date.now();
    setNotice(null);
    setConfirmingId(checkinId);
  };

  const cancelConfirm = () => {
    if (savingId) return;
    setConfirmingId(null);
  };

  const markDone = async (row) => {
    if (savingId) return;
    if (Date.now() - confirmOpenedAt.current < CONFIRM_ARM_MS) return;
    setSavingId(row.checkinId);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/checkins/${row.checkinId}/mark-done`, { method: 'POST' });
      if (res.status === 404 || res.status === 409) {
        // Already done somewhere else, such as a Loom sent from another tab.
        // The list is out of date, so reload it rather than guess.
        setConfirmingId(null);
        setNotice({ text: 'That one was already done, so the list has been refreshed.' });
        fetchData();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await res.json();
      setData((prev) => ({
        ...prev,
        pending: prev.pending.filter((r) => r.checkinId !== row.checkinId),
        done: [...prev.done, { ...row, respondedAt: saved.respondedAt, respondedVia: saved.respondedVia }]
          .sort(bySubmittedDesc),
      }));
      setConfirmingId(null);
      setNotice({ text: `${row.name} moved to Done.`, undoId: row.checkinId });
    } catch (err) {
      console.error('Failed to mark check-in done:', err);
      setNotice({ text: `Could not mark ${row.name} as done. Try again.`, error: true });
    } finally {
      setSavingId(null);
    }
  };

  const undoMarkDone = async (e, checkinId) => {
    e.stopPropagation();
    if (savingId) return;
    const row = data.done.find((r) => r.checkinId === checkinId);
    setSavingId(checkinId);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/checkins/${checkinId}/unmark-done`, { method: 'POST' });
      if (res.status === 404 || res.status === 409) {
        fetchData();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((prev) => {
        const current = prev.done.find((r) => r.checkinId === checkinId);
        if (!current) return prev;
        const { respondedAt, respondedVia, ...restored } = current;
        return {
          ...prev,
          done: prev.done.filter((r) => r.checkinId !== checkinId),
          pending: [...prev.pending, restored].sort(bySubmittedDesc),
        };
      });
      if (row) setNotice({ text: `${row.name} moved back to Pending.` });
    } catch (err) {
      console.error('Failed to move check-in back to Pending:', err);
      setNotice({ text: 'Could not move it back to Pending. Try again.', error: true });
    } finally {
      setSavingId(null);
    }
  };

  if (!isOpen) return null;

  const rows = data[subTab] || [];

  return (
    <>
      {/* Backdrop */}
      <div className="hub-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="hub-panel" role="dialog" aria-label="Check-in Hub">
        {/* Header */}
        <div className="hub-panel__header">
          <h2 className="hub-panel__title">Check-in Hub</h2>
          <button
            className="hub-panel__close"
            onClick={onClose}
            aria-label="Close Check-in Hub"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Cycle closed banner */}
        {data.cycleClosed && (
          <div className="hub-panel__cycle-closed">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Cycle closed - response window ended Wednesday</span>
          </div>
        )}

        {/* Filter toggle */}
        <div className="hub-panel__filters">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`hub-filter-pill ${filter === opt.key ? 'hub-filter-pill--active' : ''}`}
              onClick={() => setFilter(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sub-tabs */}
        <div className="hub-panel__subtabs">
          {SUB_TABS.map((tab) => {
            const count = (data[tab.key] || []).length;
            return (
              <button
                key={tab.key}
                className={`hub-subtab ${subTab === tab.key ? 'hub-subtab--active' : ''}`}
                onClick={() => setSubTab(tab.key)}
              >
                {tab.label}
                <span className="hub-subtab__count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Result of the last mark done or undo */}
        {notice && (
          <div
            className={`hub-panel__notice${notice.error ? ' hub-panel__notice--error' : ''}`}
            role="status"
          >
            <span>{notice.text}</span>
            {notice.undoId && (
              <button
                className="hub-panel__notice-undo"
                onClick={(e) => undoMarkDone(e, notice.undoId)}
              >
                Undo
              </button>
            )}
          </div>
        )}

        {/* Client rows */}
        <div className="hub-panel__list">
          {loading && (
            <div className="hub-panel__loading">Loading...</div>
          )}

          {!loading && rows.length === 0 && (
            <div className="hub-panel__empty">
              {subTab === 'pending' && 'No pending check-ins'}
              {subTab === 'done' && 'No completed check-ins'}
              {subTab === 'notSubmitted' && 'All clients have submitted'}
            </div>
          )}

          {!loading && rows.map((row, i) => {
            const key = row.checkinId || row.clientId || i;

            if (subTab === 'pending' && row.checkinId && row.checkinId === confirmingId) {
              const saving = savingId === row.checkinId;
              const first = firstName(row.name);
              return (
                <div className="hub-confirm" key={key}>
                  <p className="hub-confirm__title">
                    Mark {first}'s {typeNoun(row.type)} as done?
                  </p>
                  <p className="hub-confirm__text">
                    It moves to Done without a Loom. Nothing is sent to {first}.
                  </p>
                  <div className="hub-confirm__actions">
                    <button
                      ref={cancelRef}
                      className="hub-confirm__btn hub-confirm__btn--cancel"
                      onClick={cancelConfirm}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      className="hub-confirm__btn hub-confirm__btn--confirm"
                      onClick={() => markDone(row)}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Mark done'}
                    </button>
                  </div>
                </div>
              );
            }

            const canMarkDone = subTab === 'pending' && Boolean(row.checkinId);
            const markedDone = subTab === 'done' && row.respondedVia === 'marked_done';

            return (
              <div
                className={`hub-row${canMarkDone || markedDone ? ' hub-row--actionable' : ''}`}
                key={key}
                onClick={() => onSelectClient && onSelectClient(row.clientId, 'overview')}
                style={{ cursor: onSelectClient ? 'pointer' : undefined }}
              >
                <div className="hub-row__left">
                  <span className="hub-row__name">{row.name}</span>
                  <span className="hub-row__meta">
                    <span className="hub-row__program">{formatProgram(row.program)}</span>
                    {row.type && (
                      <span className="hub-row__type">{formatType(row.type)}</span>
                    )}
                  </span>
                </div>
                <div className="hub-row__right">
                  {subTab === 'pending' && row.submittedAt && (
                    <span className="hub-row__time">{timeAgo(row.submittedAt)}</span>
                  )}
                  {subTab === 'done' && !markedDone && row.respondedAt && (
                    <span className="hub-row__time">{timeAgo(row.respondedAt)}</span>
                  )}
                  {/* In place of the time, which squeezed the name off the row */}
                  {markedDone && (
                    <span
                      className="hub-row__no-loom"
                      title={row.respondedAt ? `Marked done ${timeAgo(row.respondedAt)}, without a Loom` : undefined}
                    >
                      No Loom
                    </span>
                  )}
                  {subTab === 'pending' && (
                    <span className="hub-row__dot hub-row__dot--red" title="Pending" />
                  )}
                  {subTab === 'done' && !markedDone && (
                    <span className="hub-row__dot hub-row__dot--green" title="Responded" />
                  )}
                  {markedDone && (
                    <span className="hub-row__dot hub-row__dot--hollow" title="Marked done without a Loom" />
                  )}
                </div>
                {canMarkDone && (
                  <button
                    className="hub-row__action"
                    onClick={(e) => openConfirm(e, row.checkinId)}
                    aria-label={`Mark ${row.name}'s ${typeNoun(row.type)} as done`}
                    title="Mark done without a Loom"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 6.25l2.25 2.25L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Done
                  </button>
                )}
                {markedDone && (
                  <button
                    className="hub-row__action"
                    onClick={(e) => undoMarkDone(e, row.checkinId)}
                    aria-label={`Move ${row.name} back to Pending`}
                    title="Move back to Pending"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M3.5 4.5h4a2.25 2.25 0 010 4.5H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M5 2.5l-2 2 2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Undo
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default CheckinHub;
