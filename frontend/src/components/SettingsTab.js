import React, { useState, useEffect } from 'react';
import './SettingsTab.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

const REVOKE_WARNING =
  'Log out every device, everywhere, including this one?\n\n'
  + 'Use this if you think someone else may have access. '
  + 'You will need your password to get back in.';

function confirmRevoke(e) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(REVOKE_WARNING)) e.preventDefault();
}

function SettingsTab() {
  const [mfcEnabled, setMfcEnabled] = useState(true);
  const [coreEnabled, setCoreEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // tracks which toggle is saving
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch(`${API_BASE}/api/settings`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setMfcEnabled(data.mfcRemindersEnabled);
        setCoreEnabled(data.coreRemindersEnabled);
        setError(null);
      } catch {
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  async function handleToggleMfc() {
    const newValue = !mfcEnabled;
    setSaving('mfc');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfcRemindersEnabled: newValue }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setMfcEnabled(newValue);
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(null);
    }
  }

  async function handleToggleCore() {
    const newValue = !coreEnabled;
    setSaving('core');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coreRemindersEnabled: newValue }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setCoreEnabled(newValue);
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="settings">Loading settings...</div>;
  }

  return (
    <div className="settings">
      <h2 className="settings__heading">Settings</h2>

      <div className="settings__section">
        <h3 className="settings__section-title">Reminders</h3>

        <div className="settings__row">
          <div className="settings__row-info">
            <span className="settings__row-label">My Fit Coach weekly reminders</span>
            <span className="settings__row-description">
              Send automatic reminders to MFC clients who have not submitted their
              weekly check-in by Monday at 8:30pm (Dublin time)
            </span>
          </div>
          <button
            className={`settings__toggle${mfcEnabled ? ' settings__toggle--on' : ''}`}
            onClick={handleToggleMfc}
            disabled={saving === 'mfc'}
            aria-label="Toggle My Fit Coach weekly reminders"
          >
            <span className="settings__toggle-knob" />
          </button>
        </div>

        <div className="settings__divider" />

        <div className="settings__row">
          <div className="settings__row-info">
            <span className="settings__row-label">My Fit Coach Core monthly reminders</span>
            <span className="settings__row-description">
              Send automatic reminders to Core clients who have not submitted their
              end of month report by the EOM deadline Monday at 7:00pm (Dublin time)
            </span>
          </div>
          <button
            className={`settings__toggle${coreEnabled ? ' settings__toggle--on' : ''}`}
            onClick={handleToggleCore}
            disabled={saving === 'core'}
            aria-label="Toggle My Fit Coach Core monthly reminders"
          >
            <span className="settings__toggle-knob" />
          </button>
        </div>

        <div className="settings__info">
          <p className="settings__info-line">
            These toggles control reminders per program type. Individual clients can also
            be disabled from the Clients tab using the per-client reminder toggle.
          </p>
        </div>
      </div>

      <div className="settings__section settings__section--spaced">
        <h3 className="settings__section-title">Your account</h3>

        <div className="settings__row">
          <div className="settings__row-info">
            <span className="settings__row-label">Log out</span>
            <span className="settings__row-description">
              Signs you out of this browser only. Other devices stay signed in.
            </span>
          </div>
          <a className="settings__button" href={`${API_BASE}/logout`}>
            Log out
          </a>
        </div>

        <div className="settings__divider" />

        <div className="settings__row">
          <div className="settings__row-info">
            <span className="settings__row-label">Log out everywhere</span>
            <span className="settings__row-description">
              Signs out every device that is logged in, including this one. Use this if you
              think someone else may have access. You will need your password again.
            </span>
          </div>
          {/*
            A real form POST rather than fetch, so the browser follows the server's
            redirect to the login page. This is the same mechanism the MyFitCoach Forms
            admin area uses, and it reuses the existing /logout-everywhere endpoint
            without any backend change.
          */}
          <form method="POST" action={`${API_BASE}/logout-everywhere`} onSubmit={confirmRevoke}>
            <button className="settings__button settings__button--danger" type="submit">
              Log out everywhere
            </button>
          </form>
        </div>
      </div>

      {error && <div className="settings__error">{error}</div>}
    </div>
  );
}

export default SettingsTab;
