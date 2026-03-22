import React, { useState, useEffect, useCallback, useRef } from 'react';
import './ClientManager.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

const PROGRAM_LABELS = {
  my_fit_coach: 'My Fit Coach',
  my_fit_coach_core: 'My Fit Coach Core',
};

const PHASE_LABELS = {
  recomp: 'Recomp',
  fat_loss: 'Fat Loss',
  building: 'Building',
  maintenance: 'Maintenance',
};

function ClientManager({ onSelectClient }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [search, setSearch] = useState('');

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/clients`);
      const data = await res.json();
      setClients(data.clients);
      setError(null);
    } catch {
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const openEdit = useCallback((client) => {
    setEditingClient(client);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingClient(null);
  }, []);

  const handleSave = useCallback(async (formData) => {
    const url = editingClient
      ? `${API_BASE}/api/clients/${editingClient.id}`
      : `${API_BASE}/api/clients`;
    const res = await fetch(url, {
      method: editingClient ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save');
    }

    await fetchClients();
    closeModal();
  }, [editingClient, fetchClients, closeModal]);

  const handleToggleActive = useCallback(async (client) => {
    const action = client.active ? 'deactivate' : 'activate';
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/${action}`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error();
      await fetchClients();
    } catch {
      setError(`Failed to ${action} client`);
    }
  }, [fetchClients]);

  const handleToggleReminders = useCallback(async (client) => {
    const newValue = !client.reminders_enabled;
    // Optimistic update
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, reminders_enabled: newValue } : c));
    try {
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/toggle-reminders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remindersEnabled: newValue }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, reminders_enabled: !newValue } : c));
      setError('Failed to toggle reminders');
    }
  }, []);

  if (loading) {
    return (
      <div className="cm">
        <div className="cm__loading">Loading clients...</div>
      </div>
    );
  }

  const pendingCount = clients.filter(c => c.pending_setup).length;

  // Filter clients by search term (name only)
  const filtered = search.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : clients;

  return (
    <div className="cm">
      <div className="cm__header">
        <h2 className="cm__title">Clients</h2>
        <div className="cm__header-right">
          {pendingCount > 0 && (
            <span className="cm__pending-badge">
              {pendingCount} pending setup
            </span>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="cm__search-wrap">
        <svg className="cm__search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <input
          className="cm__search-input"
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="cm__error">{error}</div>}

      <div className="cm__list">
        {/* Column headers */}
        <div className="cm__row cm__row--header">
          <span className="cm__col cm__col--name">Name</span>
          <span className="cm__col cm__col--program">Program</span>
          <span className="cm__col cm__col--phase">Phase</span>
          <span className="cm__col cm__col--tid">Trainerize ID</span>
          <span className="cm__col cm__col--status">Status</span>
          <span className="cm__col cm__col--reminders">Reminders</span>
          <span className="cm__col cm__col--actions">Actions</span>
        </div>

        {filtered.length === 0 && (
          <div className="cm__empty">
            {search.trim() ? 'No clients match your search' : 'No clients yet. Clients will appear here automatically when added in Trainerize.'}
          </div>
        )}

        {filtered.map((client) => (
          <div
            key={client.id}
            className={`cm__row ${!client.active ? 'cm__row--inactive' : ''} ${client.pending_setup ? 'cm__row--pending' : ''}`}
          >
            <span className="cm__col cm__col--name">
              <button
                className="cm__name-link"
                onClick={() => onSelectClient && onSelectClient(client.id, 'calendar')}
                title={`View ${client.name}`}
              >
                {client.name}
              </button>
              {client.pending_setup && (
                <span className="cm__setup-tag">Needs setup</span>
              )}
            </span>
            <span className="cm__col cm__col--program">
              {client.program ? (
                <span className={`cm__program-pill cm__program-pill--${client.program}`}>
                  {PROGRAM_LABELS[client.program]}
                </span>
              ) : (
                <button
                  className="cm__assign-btn"
                  onClick={() => openEdit(client)}
                  title="Assign program"
                >
                  Assign program
                </button>
              )}
            </span>
            <span className="cm__col cm__col--phase">
              {client.current_phase ? PHASE_LABELS[client.current_phase] : <span className="cm__muted">-</span>}
            </span>
            <span className="cm__col cm__col--tid">
              {client.trainerize_id || <span className="cm__muted">-</span>}
            </span>
            <span className="cm__col cm__col--status">
              <span className={`cm__status-dot cm__status-dot--${client.active ? 'active' : 'inactive'}`} />
              {client.active ? 'Active' : 'Inactive'}
            </span>
            <span className="cm__col cm__col--reminders">
              <button
                className={`cm__reminder-toggle${client.reminders_enabled ? ' cm__reminder-toggle--on' : ''}`}
                onClick={() => handleToggleReminders(client)}
                title={client.reminders_enabled ? 'Reminders on - click to disable' : 'Reminders off - click to enable'}
                aria-label={`Toggle reminders for ${client.name}`}
              >
                <span className="cm__reminder-toggle-knob" />
              </button>
            </span>
            <span className="cm__col cm__col--actions">
              <button
                className="cm__action-btn"
                onClick={() => openEdit(client)}
                title="Edit client"
                aria-label={`Edit ${client.name}`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M10.5 1.5l2 2-8 8H2.5v-2l8-8z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className="cm__action-btn"
                onClick={() => handleToggleActive(client)}
                title={client.active ? 'Deactivate client' : 'Activate client'}
                aria-label={client.active ? `Deactivate ${client.name}` : `Activate ${client.name}`}
              >
                {client.active ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </span>
          </div>
        ))}
      </div>

      {modalOpen && (
        <ClientModal
          client={editingClient}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function ClientModal({ client, onSave, onClose }) {
  const isEdit = !!client;
  const [name, setName] = useState(client?.name || '');
  const [program, setProgram] = useState(client?.program || '');
  const [currentPhase, setCurrentPhase] = useState(client?.current_phase || '');
  const [trainerizeId, setTrainerizeId] = useState(client?.trainerize_id || '');
  const [mfpUrl, setMfpUrl] = useState(client?.mfp_url || '');
  const [fibreTarget, setFibreTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const programRef = useRef(null);
  const nameRef = useRef(null);

  // Fetch fibre target from client_settings when editing
  useEffect(() => {
    if (!isEdit || !client?.id) return;
    let cancelled = false;
    async function fetchSettings() {
      try {
        const res = await fetch(`${API_BASE}/api/nutrition/${client.id}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setFibreTarget(data.fibreTarget ?? 20);
        }
      } catch { /* ignore */ }
    }
    fetchSettings();
    return () => { cancelled = true; };
  }, [isEdit, client?.id]);

  // Focus program select if pending setup, otherwise name
  useEffect(() => {
    if (client?.pending_setup && !client?.program) {
      setTimeout(() => programRef.current?.focus(), 200);
    } else {
      setTimeout(() => nameRef.current?.focus(), 200);
    }
  }, [client]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, saving]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        program: program || null,
        current_phase: currentPhase || null,
        trainerize_id: trainerizeId.trim() || null,
        mfp_url: mfpUrl.trim() || null,
      });

      // Save fibre target if editing
      if (isEdit && fibreTarget !== '') {
        try {
          await fetch(`${API_BASE}/api/overview/${client.id}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fibreTarget: parseInt(fibreTarget, 10) || 20 }),
          });
        } catch { /* ignore settings save error */ }
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <>
      <div className="cm-backdrop" onClick={!saving ? onClose : undefined} />
      <div className="cm-modal" role="dialog" aria-label={isEdit ? 'Edit Client' : 'Add Client'}>
        <div className="cm-modal__header">
          <h2 className="cm-modal__title">{isEdit ? 'Edit Client' : 'Add Client'}</h2>
          <button
            className="cm-modal__close"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {client?.pending_setup && (
          <div className="cm-modal__setup-banner">
            This client was added from Trainerize and needs a program assigned.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="cm-modal__field">
            <label className="cm-modal__label" htmlFor="client-name">Name</label>
            <input
              ref={nameRef}
              id="client-name"
              className="cm-modal__input"
              type="text"
              placeholder="e.g. Brendan Smart"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="cm-modal__field">
            <label className="cm-modal__label" htmlFor="client-program">Program</label>
            <select
              ref={programRef}
              id="client-program"
              className={`cm-modal__select ${!program ? 'cm-modal__select--empty' : ''}`}
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              disabled={saving}
            >
              <option value="">Select program</option>
              <option value="my_fit_coach">My Fit Coach</option>
              <option value="my_fit_coach_core">My Fit Coach Core</option>
            </select>
          </div>

          <div className="cm-modal__field">
            <label className="cm-modal__label" htmlFor="client-phase">Phase</label>
            <select
              id="client-phase"
              className={`cm-modal__select ${!currentPhase ? 'cm-modal__select--empty' : ''}`}
              value={currentPhase}
              onChange={(e) => setCurrentPhase(e.target.value)}
              disabled={saving}
            >
              <option value="">No phase</option>
              <option value="recomp">Recomp</option>
              <option value="fat_loss">Fat Loss</option>
              <option value="building">Building</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          <div className="cm-modal__field">
            <label className="cm-modal__label" htmlFor="client-tid">Trainerize ID</label>
            <input
              id="client-tid"
              className="cm-modal__input"
              type="text"
              placeholder="e.g. 5346208"
              value={trainerizeId}
              onChange={(e) => setTrainerizeId(e.target.value)}
              disabled={saving}
            />
            <span className="cm-modal__hint">Auto-populated from Trainerize - edit only if incorrect</span>
          </div>

          <div className="cm-modal__field">
            <label className="cm-modal__label" htmlFor="client-mfp">MyFitnessPal URL</label>
            <input
              id="client-mfp"
              className="cm-modal__input"
              type="url"
              placeholder="e.g. https://www.myfitnesspal.com/food/diary/username"
              value={mfpUrl}
              onChange={(e) => setMfpUrl(e.target.value)}
              disabled={saving}
            />
            <span className="cm-modal__hint">Full URL to client's MFP diary page</span>
          </div>

          {isEdit && (
            <div className="cm-modal__field">
              <label className="cm-modal__label" htmlFor="client-fibre">Fibre Target (g)</label>
              <input
                id="client-fibre"
                className="cm-modal__input"
                type="number"
                min="0"
                max="100"
                placeholder="20"
                value={fibreTarget}
                onChange={(e) => setFibreTarget(e.target.value)}
                disabled={saving}
              />
              <span className="cm-modal__hint">Default is 20g - override per client if needed</span>
            </div>
          )}

          {error && <div className="cm-modal__error">{error}</div>}

          <div className="cm-modal__actions">
            <button
              type="button"
              className="cm-modal__btn cm-modal__btn--cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cm-modal__btn cm-modal__btn--save"
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default ClientManager;
