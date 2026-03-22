import React, { useState, useEffect, useRef } from 'react';
import './LoomModal.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

function firstName(fullName) {
  return (fullName || '').split(' ')[0];
}

const URL_PLACEHOLDER = '[Loom URL]';

function buildTemplate(clientName, url) {
  return `Hey ${firstName(clientName)},\n\nThanks a mill for checking in.\n\nHere is your feedback for last week.\n${url || URL_PLACEHOLDER}`;
}

function isLoomUrl(str) {
  const t = (str || '').trim();
  return t.startsWith('https://www.loom.com/') || t.startsWith('https://loom.com/');
}

function LoomModal({ isOpen, onClose, clientId, clientName, onSent }) {
  const [loomUrl, setLoomUrl] = useState('');
  const [message, setMessage] = useState('');
  const [checkinId, setCheckinId] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [noPending, setNoPending] = useState(false);
  const urlInputRef = useRef(null);
  const prevUrlRef = useRef('');

  // Fetch the pending check-in for this client when modal opens
  useEffect(() => {
    if (!isOpen || !clientId) return;

    // Reset state
    setLoomUrl('');
    prevUrlRef.current = '';
    setMessage(buildTemplate(clientName, ''));
    setCheckinId(null);
    setSending(false);
    setSent(false);
    setError(null);
    setNoPending(false);

    fetch(`${API_BASE}/api/checkins/pending/${clientId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.pending) {
          setCheckinId(data.pending.checkinId);
        } else {
          setNoPending(true);
        }
      })
      .catch(() => setError('Failed to load check-in data'));

    // Focus the URL input
    setTimeout(() => urlInputRef.current?.focus(), 200);
  }, [isOpen, clientId, clientName]);

  // Sync Loom URL into message body - only when a valid URL is pasted or field is cleared
  useEffect(() => {
    const prev = prevUrlRef.current || URL_PLACEHOLDER;
    const trimmed = loomUrl.trim();

    if (isLoomUrl(trimmed)) {
      // Valid Loom URL pasted - swap it into the message
      setMessage((m) => m.includes(prev) ? m.replace(prev, trimmed) : m);
      prevUrlRef.current = trimmed;
    } else if (trimmed === '' && prev !== URL_PLACEHOLDER) {
      // Field cleared - put placeholder back
      setMessage((m) => m.includes(prev) ? m.replace(prev, URL_PLACEHOLDER) : m);
      prevUrlRef.current = '';
    }
  }, [loomUrl]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, sending]);

  if (!isOpen) return null;

  const canSend = isLoomUrl(loomUrl) && checkinId && !sending && !sent;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/checkins/${checkinId}/send-loom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loomUrl: loomUrl.trim(), message }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send');
        setSending(false);
        return;
      }

      setSent(true);
      setSending(false);

      // Notify parent to refresh data
      if (onSent) onSent();

      // Auto-close after showing success
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError('Network error - please try again');
      setSending(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="loom-backdrop" onClick={!sending ? onClose : undefined} />

      {/* Modal */}
      <div className="loom-modal" role="dialog" aria-label="Send Loom Feedback">
        {/* Header */}
        <div className="loom-modal__header">
          <h2 className="loom-modal__title">Send Loom Feedback</h2>
          <button
            className="loom-modal__close"
            onClick={onClose}
            aria-label="Close"
            disabled={sending}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* No pending check-in warning */}
        {noPending && (
          <div className="loom-modal__warning">
            No pending check-in found for {clientName} this cycle.
          </div>
        )}

        {/* Loom URL input */}
        <div className="loom-modal__field">
          <label className="loom-modal__label" htmlFor="loom-url">Loom URL</label>
          <input
            ref={urlInputRef}
            id="loom-url"
            className="loom-modal__input"
            type="url"
            placeholder="https://www.loom.com/share/..."
            value={loomUrl}
            onChange={(e) => setLoomUrl(e.target.value)}
            disabled={sending || sent}
          />
        </div>

        {/* Message preview */}
        <div className="loom-modal__field">
          <label className="loom-modal__label" htmlFor="loom-message">Message</label>
          <textarea
            id="loom-message"
            className="loom-modal__textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending || sent}
            rows={8}
          />
        </div>

        {/* Error */}
        {error && <div className="loom-modal__error">{error}</div>}

        {/* Success */}
        {sent && (
          <div className="loom-modal__success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Feedback sent
          </div>
        )}

        {/* Actions */}
        <div className="loom-modal__actions">
          <button
            className="loom-modal__btn loom-modal__btn--cancel"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </button>
          <button
            className="loom-modal__btn loom-modal__btn--send"
            onClick={handleSend}
            disabled={!canSend}
          >
            {sending ? 'Sending...' : sent ? 'Sent ✓' : 'Send'}
          </button>
        </div>
      </div>
    </>
  );
}

export default LoomModal;
