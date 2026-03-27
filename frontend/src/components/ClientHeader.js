import React, { useState, useEffect, useRef } from 'react';
import './ClientHeader.css';

const PHASE_LABELS = {
  recomp: 'Recomp',
  fat_loss: 'Fat Loss',
  building: 'Building',
  maintenance: 'Maintenance',
};

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

function formatTenure(joinedAt) {
  if (!joinedAt) return null;
  const diff = Date.now() - new Date(joinedAt).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}m` : `${years}y`;
}

const PHASE_COLORS = {
  fat_loss: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  building: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  recomp: { bg: '#f0fdfa', color: '#0d9488', border: '#99f6e4' },
  maintenance: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
};

function ClientHeader({ client, onHubToggle, onLoomOpen, onPhaseChange, tabs, activeClientTab, onClientTabChange }) {
  const [phaseOpen, setPhaseOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!phaseOpen) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setPhaseOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [phaseOpen]);

  const lastCheckin = formatDate(client?.lastCheckinAt);
  const tenure = formatTenure(client?.joinedAt);
  const phase = client?.currentPhase ? PHASE_LABELS[client.currentPhase] : null;
  const phaseStyle = client?.currentPhase ? PHASE_COLORS[client.currentPhase] : null;
  const sessions = client?.sessionCount;

  return (
    <div className="client-header">
      <div className="client-header__left">
        <button
          className="client-header__hub-trigger"
          onClick={onHubToggle}
          aria-label="Check-in Hub"
          data-tooltip="Check-in Hub"
        >
          {/* Inbox / checklist icon - 20px */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 4h14v1H3V4zm0 4h14v1H3V8zm0 4h10v1H3v-1zm0 4h7v1H3v-1z"
              fill="currentColor"
            />
          </svg>
        </button>
        <div className="client-header__info">
          <div className="client-header__name-row">
            <h1 className="client-header__name">{client?.name || 'Select a client'}</h1>
            {client && (
              <div className="client-header__phase-wrap" ref={dropdownRef}>
                <button
                  className="client-header__phase-prominent"
                  style={phaseStyle ? { background: phaseStyle.bg, color: phaseStyle.color, borderColor: phaseStyle.border } : undefined}
                  onClick={() => setPhaseOpen(!phaseOpen)}
                >
                  {phase || 'Set Phase'}
                  <span className="client-header__phase-caret">{phaseOpen ? '\u25B2' : '\u25BC'}</span>
                </button>
                {phaseOpen && (
                  <div className="client-header__phase-dropdown">
                    {Object.entries(PHASE_LABELS).map(([val, label]) => (
                      <button
                        key={val}
                        className={`client-header__phase-option${client?.currentPhase === val ? ' client-header__phase-option--active' : ''}`}
                        onClick={() => { onPhaseChange(val); setPhaseOpen(false); }}
                      >
                        <span className="client-header__phase-dot" style={{ background: PHASE_COLORS[val].color }} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {client?.objectives && (
            <p className="client-header__objectives">{client.objectives}</p>
          )}
          {client && (
            <p className="client-header__meta">
              {lastCheckin && <>Last check-in: {lastCheckin}</>}
              {tenure && <>{lastCheckin ? ' \u00B7 ' : ''}{tenure}</>}
              {sessions != null && (
                <>{(lastCheckin || tenure) ? ' \u00B7 ' : ''}{sessions} sessions</>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="client-header__right">
        {tabs && tabs.length > 0 && (
          <nav className="client-header__tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`client-header__tab${activeClientTab === tab.key ? ' client-header__tab--active' : ''}`}
                onClick={() => onClientTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
        <button
          className="client-header__loom-trigger"
          aria-label="Send Loom Feedback"
          data-tooltip="Send Loom Feedback"
          onClick={onLoomOpen}
          disabled={!client}
        >
          {/* Mail envelope with small play/record circle */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Envelope body */}
            <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            {/* Envelope flap */}
            <path d="M2 6l8 5 8-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {/* Small record/play circle bottom-right */}
            <circle cx="15.5" cy="13.5" r="2.5" fill="currentColor" />
            <path d="M14.8 13.5l2 0" stroke="var(--color-white)" strokeWidth="0" fill="none" />
            {/* Play triangle inside circle */}
            <path d="M14.75 12.5l2 1-2 1z" fill="var(--color-white)" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default ClientHeader;
