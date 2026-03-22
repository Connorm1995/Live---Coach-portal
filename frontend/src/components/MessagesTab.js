import React, { useState, useEffect, useRef, useCallback } from 'react';
import './MessagesTab.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatScheduleTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Convert Dublin local date/time inputs to UTC ISO string
function dublinToUTC(dateStr, timeStr) {
  // Treat the input as UTC first
  const asUTC = new Date(`${dateStr}T${timeStr}:00Z`);
  // Find Dublin's offset at this point by formatting to Dublin and parsing back
  const dublinDisplay = asUTC.toLocaleString('sv-SE', { timeZone: 'Europe/Dublin' });
  const dublinAsIfUTC = new Date(dublinDisplay.replace(' ', 'T') + 'Z');
  const offsetMs = dublinAsIfUTC.getTime() - asUTC.getTime();
  // User entered Dublin time, subtract offset to get UTC
  return new Date(asUTC.getTime() - offsetMs).toISOString();
}

function decodeHtml(html) {
  if (!html) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isImage(contentType) {
  return contentType && contentType.startsWith('image/');
}

function isVideo(contentType) {
  return contentType && contentType.startsWith('video/');
}

// Render attachment based on content type
function AttachmentRenderer({ attachment }) {
  if (!attachment) return null;

  const { fileName, contentType, fileSize, fileToken } = attachment;
  // Trainerize file URLs typically use the fileToken
  const fileUrl = fileToken ? `https://api.trainerize.com/v03/file/get?fileToken=${fileToken}` : null;

  if (isImage(contentType) && fileUrl) {
    return (
      <div className="msg__attachment msg__attachment--image">
        <a href={fileUrl} target="_blank" rel="noopener noreferrer">
          <img src={fileUrl} alt={fileName || 'Image'} className="msg__attachment-img" loading="lazy" />
        </a>
      </div>
    );
  }

  if (isVideo(contentType) && fileUrl) {
    return (
      <div className="msg__attachment msg__attachment--video">
        <video controls className="msg__attachment-video" preload="metadata">
          <source src={fileUrl} type={contentType} />
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  // PDF and other files - download link
  return (
    <div className="msg__attachment msg__attachment--file">
      <a href={fileUrl || '#'} target="_blank" rel="noopener noreferrer" className="msg__attachment-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="msg__attachment-name">{fileName || 'File'}</span>
        {fileSize && <span className="msg__attachment-size">{formatFileSize(fileSize)}</span>}
      </a>
    </div>
  );
}

export default function MessagesTab() {
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [scheduledMessages, setScheduledMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  // File upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadedFileToken, setUploadedFileToken] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/threads`);
      if (!res.ok) throw new Error('Failed to fetch threads');
      const data = await res.json();
      setThreads(data.threads || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching threads:', err);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const fetchMessages = useCallback(async (threadId) => {
    setThreadLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/messages/thread/${threadId}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      setMessages(data.messages || []);
      setScheduledMessages(data.scheduledMessages || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setMessages([]);
      setScheduledMessages([]);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeThread) fetchMessages(activeThread.threadID);
  }, [activeThread, fetchMessages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, scheduledMessages]);

  // File selection handler
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    // Preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }

    // Upload immediately
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/messages/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setUploadedFileToken(data.fileToken);
    } catch (err) {
      console.error('Error uploading file:', err);
      setSelectedFile(null);
      setFilePreview(null);
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setUploadedFileToken(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    if ((!messageText.trim() && !uploadedFileToken) || !activeThread || sending) return;

    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeThread.clientId,
          body: messageText.trim() || (selectedFile ? selectedFile.name : ''),
          threadId: activeThread.threadID,
          fileToken: uploadedFileToken || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to send');
      setMessageText('');
      clearFile();
      await fetchMessages(activeThread.threadID);
      await fetchThreads();
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async () => {
    if (!messageText.trim() || !activeThread || !scheduleDate || !scheduleTime) return;

    const sendAtUTC = dublinToUTC(scheduleDate, scheduleTime);

    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/messages/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeThread.clientId,
          body: messageText.trim(),
          sendAt: sendAtUTC,
          threadId: activeThread.threadID,
          fileToken: uploadedFileToken || undefined,
          fileName: selectedFile?.name || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to schedule');
      setMessageText('');
      setShowScheduler(false);
      setScheduleDate('');
      setScheduleTime('');
      clearFile();
      await fetchMessages(activeThread.threadID);
    } catch (err) {
      console.error('Error scheduling message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleCancelScheduled = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/scheduled/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to cancel');
      await fetchMessages(activeThread.threadID);
    } catch (err) {
      console.error('Error cancelling scheduled message:', err);
    }
  };

  const handleRetryScheduled = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/scheduled/${id}/retry`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to retry');
      await fetchMessages(activeThread.threadID);
    } catch (err) {
      console.error('Error retrying message:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) return <div className="msg__loading">Loading conversations...</div>;
  if (error) return <div className="msg__error">{error}</div>;

  return (
    <div className="msg">
      {/* Thread list */}
      <div className="msg__threads">
        <div className="msg__threads-header">
          <h2 className="msg__threads-title">Messages</h2>
        </div>
        <div className="msg__threads-list">
          {threads.length === 0 && (
            <div className="msg__threads-empty">No conversations yet</div>
          )}
          {threads.map(thread => (
            <button
              key={thread.threadID}
              className={`msg__thread-item${activeThread?.threadID === thread.threadID ? ' msg__thread-item--active' : ''}`}
              onClick={() => setActiveThread(thread)}
            >
              <div className="msg__thread-item-top">
                <span className="msg__thread-name">{thread.clientName}</span>
                <span className="msg__thread-time">{formatTime(thread.lastSentTime)}</span>
              </div>
              <div className="msg__thread-item-bottom">
                <span className="msg__thread-excerpt">{decodeHtml(thread.excerpt)}</span>
                {thread.unreadCount > 0 && <span className="msg__thread-unread" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="msg__conversation">
        {!activeThread ? (
          <div className="msg__conversation-empty">Select a conversation to view messages</div>
        ) : (
          <>
            <div className="msg__conversation-header">
              <h3 className="msg__conversation-name">{activeThread.clientName}</h3>
            </div>

            <div className="msg__messages">
              {threadLoading ? (
                <div className="msg__messages-loading">Loading messages...</div>
              ) : messages.length === 0 && scheduledMessages.length === 0 ? (
                <div className="msg__messages-empty">No messages in this conversation</div>
              ) : (
                <>
                  {messages.map(msg => {
                    const isCoach = msg.sender?.type === 'trainer';
                    return (
                      <div
                        key={msg.messageID}
                        className={`msg__bubble-wrap${isCoach ? ' msg__bubble-wrap--coach' : ' msg__bubble-wrap--client'}`}
                      >
                        <div className={`msg__bubble${isCoach ? ' msg__bubble--coach' : ' msg__bubble--client'}`}>
                          {msg.body && <span className="msg__bubble-text">{decodeHtml(msg.body)}</span>}
                          {msg.attachment && <AttachmentRenderer attachment={msg.attachment} />}
                        </div>
                        <span className="msg__bubble-time">{formatTime(msg.sentTime)}</span>
                      </div>
                    );
                  })}

                  {scheduledMessages.map(sm => (
                    <div key={`sched-${sm.id}`} className="msg__bubble-wrap msg__bubble-wrap--coach">
                      <div className={`msg__bubble msg__bubble--scheduled${sm.status === 'failed' ? ' msg__bubble--failed' : ''}`}>
                        {sm.status === 'failed' ? (
                          <button
                            className="msg__scheduled-retry"
                            onClick={() => handleRetryScheduled(sm.id)}
                            title="Retry failed message"
                            aria-label="Retry failed message"
                          >
                            Retry
                          </button>
                        ) : (
                          <button
                            className="msg__scheduled-cancel"
                            onClick={() => handleCancelScheduled(sm.id)}
                            title="Cancel scheduled message"
                            aria-label="Cancel scheduled message"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                          </button>
                        )}
                        <span className="msg__bubble-text">{sm.body}</span>
                        {sm.fileName && (
                          <span className="msg__scheduled-file">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            {sm.fileName}
                          </span>
                        )}
                        <span className="msg__scheduled-label">
                          {sm.status === 'failed' ? 'Failed to send' : `Scheduled for ${formatScheduleTime(sm.sendAt)} (Dublin time)`}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <div className="msg__input-area">
              {showScheduler && (
                <div className="msg__scheduler">
                  <input type="date" className="msg__scheduler-date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                  <input type="time" className="msg__scheduler-time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                  <span className="msg__scheduler-tz">(Dublin time)</span>
                  <button className="msg__scheduler-confirm" onClick={handleSchedule} disabled={!scheduleDate || !scheduleTime || !messageText.trim() || sending}>
                    Confirm
                  </button>
                  <button className="msg__scheduler-cancel-btn" onClick={() => { setShowScheduler(false); setScheduleDate(''); setScheduleTime(''); }}>
                    Cancel
                  </button>
                </div>
              )}

              {/* File preview */}
              {selectedFile && (
                <div className="msg__file-preview">
                  {uploading && <span className="msg__file-uploading">Uploading...</span>}
                  {filePreview && <img src={filePreview} alt="Preview" className="msg__file-preview-img" />}
                  <span className="msg__file-preview-name">{selectedFile.name}</span>
                  <span className="msg__file-preview-size">{formatFileSize(selectedFile.size)}</span>
                  <button className="msg__file-preview-remove" onClick={clearFile} title="Remove file" aria-label="Remove file">&times;</button>
                </div>
              )}

              <div className="msg__input-row">
                <button
                  className="msg__attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                  aria-label="Attach file"
                  disabled={uploading}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <textarea
                  className="msg__input"
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="msg__send-btn"
                  onClick={handleSend}
                  disabled={(!messageText.trim() && !uploadedFileToken) || sending}
                  title="Send message"
                  aria-label="Send message"
                >
                  Send
                </button>
                <button
                  className="msg__schedule-btn"
                  onClick={() => setShowScheduler(!showScheduler)}
                  disabled={!messageText.trim()}
                  title="Schedule message"
                  aria-label="Schedule message"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Schedule
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
