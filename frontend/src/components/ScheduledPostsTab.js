import React, { useState, useEffect, useCallback, useRef } from 'react';
import './ScheduledPostsTab.css';

const API_BASE = process.env.REACT_APP_API_BASE || '';

function formatScheduleTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dublinToUTC(dateStr, timeStr) {
  const asUTC = new Date(`${dateStr}T${timeStr}:00Z`);
  const dublinDisplay = asUTC.toLocaleString('sv-SE', { timeZone: 'Europe/Dublin' });
  const dublinAsIfUTC = new Date(dublinDisplay.replace(' ', 'T') + 'Z');
  const offsetMs = dublinAsIfUTC.getTime() - asUTC.getTime();
  return new Date(asUTC.getTime() - offsetMs).toISOString();
}

function getDublinDateParts(dateStr) {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

function isWithin24Hours(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function ScheduledPostsTab() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [postBody, setPostBody] = useState('');
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [sentPosts, setSentPosts] = useState([]);
  const [cancelledPosts, setCancelledPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [posting, setPosting] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [cancelledOpen, setCancelledOpen] = useState(false);
  // File upload
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedFileToken, setUploadedFileToken] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  // Batch scheduling
  const [batchMode, setBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState([]);
  // Restore date/time editing
  const [restoringId, setRestoringId] = useState(null);
  const [restoreDate, setRestoreDate] = useState('');
  const [restoreTime, setRestoreTime] = useState('');
  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/groups`);
      if (!res.ok) throw new Error('Failed to fetch groups');
      const data = await res.json();
      setGroups(data.groups || []);
      if (data.groups?.length > 0 && !selectedGroup) {
        setSelectedGroup(data.groups[0]);
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
      setError('Failed to load groups');
    }
  }, [selectedGroup]);

  const fetchScheduledPosts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/posts/scheduled`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setScheduledPosts(data.scheduled || []);
    } catch (err) {
      console.error('Error fetching scheduled posts:', err);
    }
  }, []);

  const fetchSentPosts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/posts/sent`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSentPosts(data.sent || []);
    } catch (err) {
      console.error('Error fetching sent posts:', err);
    }
  }, []);

  const fetchCancelledPosts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/posts/cancelled`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCancelledPosts(data.cancelled || []);
    } catch (err) {
      console.error('Error fetching cancelled posts:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchGroups(), fetchScheduledPosts(), fetchSentPosts(), fetchCancelledPosts()])
      .finally(() => setLoading(false));
  }, [fetchGroups, fetchScheduledPosts, fetchSentPosts, fetchCancelledPosts]);

  const groupNameMap = {};
  for (const g of groups) {
    groupNameMap[g.id] = g.name;
  }

  // File selection (no pre-upload - file is sent with the post)
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadedFileToken(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Post now
  const handlePostNow = async () => {
    if (!postBody.trim() || !selectedGroup || posting) return;
    setPosting(true);
    try {
      // Use FormData to send file + text together
      const formData = new FormData();
      formData.append('groupThreadId', selectedGroup.threadID);
      formData.append('body', postBody.trim());
      if (selectedFile) formData.append('file', selectedFile);

      const res = await fetch(`${API_BASE}/api/messages/post`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to post');
      setPostBody('');
      clearFile();
      await fetchSentPosts();
    } catch (err) {
      console.error('Error posting:', err);
    } finally {
      setPosting(false);
    }
  };

  // Schedule post (single or add to batch)
  const handleSchedulePost = async () => {
    if (!postBody.trim() || !selectedGroup || !scheduleDate || !scheduleTime) return;

    const sendAtUTC = dublinToUTC(scheduleDate, scheduleTime);

    if (batchMode) {
      // Add to batch queue instead of saving immediately
      setBatchQueue(prev => [...prev, {
        groupId: selectedGroup.id,
        groupThreadId: selectedGroup.threadID,
        groupName: selectedGroup.name,
        body: postBody.trim(),
        sendAt: sendAtUTC,
        file: selectedFile || null,
        fileName: selectedFile?.name || null,
        localDate: scheduleDate,
        localTime: scheduleTime,
      }]);
      setPostBody('');
      setScheduleDate('');
      setScheduleTime('');
      clearFile();
      // Keep scheduler open for next post
      return;
    }

    // Single schedule
    setPosting(true);
    try {
      const formData = new FormData();
      formData.append('groupId', selectedGroup.id);
      formData.append('groupThreadId', selectedGroup.threadID);
      formData.append('body', postBody.trim());
      formData.append('sendAt', sendAtUTC);
      if (selectedFile) formData.append('file', selectedFile);

      const res = await fetch(`${API_BASE}/api/messages/post/schedule`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to schedule');
      setPostBody('');
      setShowScheduler(false);
      setScheduleDate('');
      setScheduleTime('');
      clearFile();
      await fetchScheduledPosts();
    } catch (err) {
      console.error('Error scheduling post:', err);
    } finally {
      setPosting(false);
    }
  };

  // Batch confirm - save all queued posts
  const handleBatchConfirm = async () => {
    if (batchQueue.length === 0) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE}/api/messages/post/schedule/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: batchQueue }),
      });
      if (!res.ok) throw new Error('Failed to batch schedule');
      setBatchQueue([]);
      setBatchMode(false);
      setShowScheduler(false);
      setScheduleDate('');
      setScheduleTime('');
      await fetchScheduledPosts();
    } catch (err) {
      console.error('Error batch scheduling:', err);
    } finally {
      setPosting(false);
    }
  };

  const removeBatchItem = (index) => {
    setBatchQueue(prev => prev.filter((_, i) => i !== index));
  };

  // Soft delete
  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/posts/scheduled/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to cancel');
      setConfirmDeleteId(null);
      await Promise.all([fetchScheduledPosts(), fetchCancelledPosts()]);
    } catch (err) {
      console.error('Error cancelling post:', err);
    }
  };

  // Restore cancelled post
  const handleRestore = async (id) => {
    try {
      const body = {};
      if (restoreDate && restoreTime) {
        body.sendAt = dublinToUTC(restoreDate, restoreTime);
      }
      const res = await fetch(`${API_BASE}/api/messages/posts/cancelled/${id}/restore`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to restore');
      setRestoringId(null);
      setRestoreDate('');
      setRestoreTime('');
      await Promise.all([fetchScheduledPosts(), fetchCancelledPosts()]);
    } catch (err) {
      console.error('Error restoring post:', err);
    }
  };

  // Retry failed post
  const handleRetry = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/posts/scheduled/${id}/retry`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to retry');
      await fetchScheduledPosts();
    } catch (err) {
      console.error('Error retrying post:', err);
    }
  };

  // Edit
  const startEdit = (post) => {
    setEditingId(post.id);
    setEditBody(post.body);
    const parts = getDublinDateParts(post.sendAt);
    setEditDate(parts.date);
    setEditTime(parts.time);
  };

  const handleSaveEdit = async () => {
    if (!editBody.trim() || !editDate || !editTime) return;
    const sendAtUTC = dublinToUTC(editDate, editTime);
    try {
      const res = await fetch(`${API_BASE}/api/messages/posts/scheduled/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody.trim(), sendAt: sendAtUTC }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setEditingId(null);
      setEditBody('');
      setEditDate('');
      setEditTime('');
      await fetchScheduledPosts();
    } catch (err) {
      console.error('Error updating post:', err);
    }
  };

  if (loading) return <div className="sp__loading">Loading...</div>;
  if (error) return <div className="sp__error">{error}</div>;

  return (
    <div className="sp">
      {/* Compose area */}
      <div className="sp__compose">
        <h2 className="sp__section-title">New Post</h2>
        <div className="sp__compose-row">
          <select
            className="sp__group-select"
            value={selectedGroup?.id || ''}
            onChange={e => {
              const g = groups.find(g => g.id === Number(e.target.value));
              setSelectedGroup(g || null);
            }}
          >
            <option value="" disabled>Select group</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <textarea
          className="sp__compose-input"
          placeholder="Write your post..."
          value={postBody}
          onChange={e => setPostBody(e.target.value)}
          rows={3}
        />

        {/* File upload */}
        {selectedFile && (
          <div className="sp__file-preview">
            {uploading && <span className="sp__file-uploading">Uploading...</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span className="sp__file-preview-name">{selectedFile.name}</span>
            <span className="sp__file-preview-size">{formatFileSize(selectedFile.size)}</span>
            <button className="sp__file-preview-remove" onClick={clearFile} title="Remove file" aria-label="Remove file">&times;</button>
          </div>
        )}

        {showScheduler && (
          <div className="sp__scheduler">
            <input type="date" className="sp__scheduler-date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
            <input type="time" className="sp__scheduler-time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
            <span className="sp__scheduler-tz">(Dublin time)</span>
            <button
              className="sp__scheduler-confirm"
              onClick={handleSchedulePost}
              disabled={!scheduleDate || !scheduleTime || !postBody.trim() || posting}
            >
              {batchMode ? 'Add to queue' : 'Confirm'}
            </button>
            <button className="sp__scheduler-cancel" onClick={() => { setShowScheduler(false); setScheduleDate(''); setScheduleTime(''); setBatchMode(false); setBatchQueue([]); }}>
              Cancel
            </button>
          </div>
        )}

        <div className="sp__compose-actions">
          <button className="sp__post-btn" onClick={handlePostNow} disabled={!postBody.trim() || !selectedGroup || posting}>
            Post Now
          </button>
          <button
            className="sp__schedule-btn"
            onClick={() => { setShowScheduler(!showScheduler); setBatchMode(false); }}
            disabled={!postBody.trim() || !selectedGroup}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Schedule
          </button>
          <button
            className="sp__batch-btn"
            onClick={() => { setShowScheduler(true); setBatchMode(true); }}
            disabled={!selectedGroup}
          >
            Batch Schedule
          </button>
          <button
            className="sp__attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach PDF"
            aria-label="Attach PDF"
            disabled={uploading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            Attach
          </button>
          <input ref={fileInputRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>
      </div>

      {/* Batch queue */}
      {batchMode && batchQueue.length > 0 && (
        <div className="sp__batch-queue">
          <h3 className="sp__batch-queue-title">Posts queued this session ({batchQueue.length})</h3>
          <div className="sp__list">
            {batchQueue.map((item, idx) => (
              <div key={idx} className="sp__card sp__card--queued">
                <div className="sp__card-body">
                  <span className="sp__card-group">{item.groupName}</span>
                  <p className="sp__card-text">{item.body}</p>
                </div>
                <div className="sp__card-footer">
                  <span className="sp__card-time">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {formatScheduleTime(item.sendAt)} (Dublin time)
                  </span>
                  {item.fileName && <span className="sp__card-file-indicator">{item.fileName}</span>}
                  <button className="sp__card-delete-btn" onClick={() => removeBatchItem(idx)} title="Remove from queue" aria-label="Remove from queue">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="sp__batch-confirm" onClick={handleBatchConfirm} disabled={posting}>
            Confirm all ({batchQueue.length} posts)
          </button>
        </div>
      )}

      {/* Upcoming scheduled posts */}
      <div className="sp__section">
        <h2 className="sp__section-title">Upcoming</h2>
        {scheduledPosts.length === 0 ? (
          <p className="sp__section-empty">No scheduled posts</p>
        ) : (
          <div className="sp__list">
            {scheduledPosts.map(post => (
              <div key={post.id} className={`sp__card${isWithin24Hours(post.sendAt) ? ' sp__card--soon' : ''}${post.status === 'failed' ? ' sp__card--failed' : ''}`}>
                {editingId === post.id ? (
                  <div className="sp__card-edit">
                    <textarea className="sp__card-edit-input" value={editBody} onChange={e => setEditBody(e.target.value)} rows={2} />
                    <div className="sp__card-edit-row">
                      <input type="date" className="sp__scheduler-date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                      <input type="time" className="sp__scheduler-time" value={editTime} onChange={e => setEditTime(e.target.value)} />
                      <span className="sp__scheduler-tz">(Dublin time)</span>
                      <button className="sp__card-save" onClick={handleSaveEdit}>Save</button>
                      <button className="sp__card-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="sp__card-body">
                      <span className="sp__card-group">{groupNameMap[post.groupId] || 'Group'}</span>
                      <p className="sp__card-text">{post.body}</p>
                    </div>
                    <div className="sp__card-footer">
                      <span className="sp__card-time">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {formatScheduleTime(post.sendAt)} (Dublin time)
                      </span>
                      {post.fileName && <span className="sp__card-file-indicator">{post.fileName}</span>}
                      {post.status === 'failed' ? (
                        <span className="sp__card-status sp__card-status--failed">Failed</span>
                      ) : (
                        <span className="sp__card-status sp__card-status--scheduled">Scheduled</span>
                      )}
                      <div className="sp__card-actions">
                        {post.status === 'failed' && (
                          <button className="sp__card-retry-btn" onClick={() => handleRetry(post.id)} title="Retry" aria-label="Retry">Retry</button>
                        )}
                        {post.status === 'pending' && (
                          <button className="sp__card-edit-btn" onClick={() => startEdit(post)} title="Edit post" aria-label="Edit post">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                        {confirmDeleteId === post.id ? (
                          <div className="sp__confirm-delete">
                            <span className="sp__confirm-text">Move to cancelled posts?</span>
                            <button className="sp__confirm-yes" onClick={() => handleDelete(post.id)}>Yes</button>
                            <button className="sp__confirm-no" onClick={() => setConfirmDeleteId(null)}>No</button>
                          </div>
                        ) : (
                          <button className="sp__card-delete-btn" onClick={() => setConfirmDeleteId(post.id)} title="Cancel post" aria-label="Cancel post">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancelled posts (collapsible) */}
      {cancelledPosts.length > 0 && (
        <div className="sp__section">
          <button className="sp__section-toggle" onClick={() => setCancelledOpen(!cancelledOpen)}>
            <h2 className="sp__section-title">Cancelled ({cancelledPosts.length})</h2>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: cancelledOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {cancelledOpen && (
            <div className="sp__list">
              {cancelledPosts.map(post => (
                <div key={post.id} className="sp__card sp__card--cancelled">
                  <div className="sp__card-body">
                    <span className="sp__card-group">{groupNameMap[post.groupId] || 'Group'}</span>
                    <p className="sp__card-text">{post.body}</p>
                  </div>
                  <div className="sp__card-footer">
                    <span className="sp__card-time">
                      Originally: {formatScheduleTime(post.sendAt)} (Dublin time)
                    </span>
                    <span className="sp__card-cancelled-at">
                      Cancelled: {formatScheduleTime(post.cancelledAt)}
                    </span>
                  </div>
                  {restoringId === post.id ? (
                    <div className="sp__restore-row">
                      <input type="date" className="sp__scheduler-date" value={restoreDate} onChange={e => setRestoreDate(e.target.value)} />
                      <input type="time" className="sp__scheduler-time" value={restoreTime} onChange={e => setRestoreTime(e.target.value)} />
                      <span className="sp__scheduler-tz">(Dublin time)</span>
                      <button className="sp__card-save" onClick={() => handleRestore(post.id)}>Restore</button>
                      <button className="sp__card-cancel" onClick={() => { setRestoringId(null); setRestoreDate(''); setRestoreTime(''); }}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      className="sp__restore-btn"
                      onClick={() => {
                        setRestoringId(post.id);
                        const parts = getDublinDateParts(post.sendAt);
                        setRestoreDate(parts.date);
                        setRestoreTime(parts.time);
                      }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sent post history */}
      <div className="sp__section">
        <h2 className="sp__section-title">Sent</h2>
        {sentPosts.length === 0 ? (
          <p className="sp__section-empty">No sent posts yet</p>
        ) : (
          <div className="sp__list">
            {sentPosts.map(post => (
              <div key={post.id} className={`sp__card sp__card--sent${post.status === 'failed' ? ' sp__card--failed' : ''}`}>
                <div className="sp__card-body">
                  <span className="sp__card-group">{groupNameMap[post.groupId] || 'Group'}</span>
                  <p className="sp__card-text">{post.body}</p>
                </div>
                <div className="sp__card-footer">
                  <span className="sp__card-time">
                    {formatScheduleTime(post.sentAt || post.sendAt)} (Dublin time)
                  </span>
                  <span className="sp__card-status sp__card-status--sent">Sent</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
