import React, { useState, useEffect, useCallback } from 'react';
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

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

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

          {!loading && rows.map((row, i) => (
            <div
              className="hub-row"
              key={row.checkinId || row.clientId || i}
              onClick={() => onSelectClient && onSelectClient(row.clientId, 'overview')}
              style={{ cursor: onSelectClient ? 'pointer' : undefined }}
            >
              <div className="hub-row__left">
                <span className="hub-row__name">{row.name}</span>
                <span className="hub-row__program">{formatProgram(row.program)}</span>
                {row.type && (
                  <span className="hub-row__type">{formatType(row.type)}</span>
                )}
              </div>
              <div className="hub-row__right">
                {subTab === 'pending' && row.submittedAt && (
                  <span className="hub-row__time">{timeAgo(row.submittedAt)}</span>
                )}
                {subTab === 'done' && row.respondedAt && (
                  <span className="hub-row__time">{timeAgo(row.respondedAt)}</span>
                )}
                {subTab === 'pending' && (
                  <span className="hub-row__dot hub-row__dot--red" title="Pending" />
                )}
                {subTab === 'done' && (
                  <span className="hub-row__dot hub-row__dot--green" title="Responded" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default CheckinHub;
