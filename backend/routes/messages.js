const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const COACH_ID = 1;

// --- Trainerize API helpers ---
const TRAINERIZE_API = 'https://api.trainerize.com/v03';
const TRAINERIZE_AUTH = 'Basic ' + Buffer.from(
  `${process.env.TRAINERIZE_GROUP_ID}:${process.env.TRAINERIZE_API_TOKEN}`
).toString('base64');

async function trainerizePost(endpoint, body) {
  const res = await fetch(`${TRAINERIZE_API}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trainerize ${endpoint} responded ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── FILE UPLOAD ────────────────────────────────────────────

/**
 * Upload a file to Trainerize as a message attachment.
 * Uses /file/upload with attachType=messageAttachment and attachTo=threadID.
 * This creates a message with the attachment in the specified thread in one step.
 * Returns { id, messageID } from Trainerize.
 */
async function trainerizeUploadAttachment(fileBuffer, fileName, mimeType, threadID) {
  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  form.append('file', blob, fileName);
  form.append('data', JSON.stringify({
    attachType: 'messageAttachment',
    attachTo: Number(threadID),
  }));

  console.log('[File Upload] Uploading to /file/upload with attachType=messageAttachment, attachTo=', threadID, 'fileName=', fileName);

  const tzRes = await fetch(`${TRAINERIZE_API}/file/upload`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: TRAINERIZE_AUTH,
    },
    body: form,
  });

  const responseText = await tzRes.text();
  console.log('[File Upload] Response status:', tzRes.status, 'body:', responseText);

  if (!tzRes.ok) {
    throw new Error(`Trainerize file/upload responded ${tzRes.status}: ${responseText}`);
  }

  let data;
  try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }
  return data;
}

// POST /api/messages/upload - upload a file to Trainerize
// Accepts optional threadID in the form body to attach directly to a message thread
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const threadID = req.body.threadID;

  try {
    if (threadID) {
      // Upload as message attachment directly to thread
      const data = await trainerizeUploadAttachment(
        req.file.buffer, req.file.originalname, req.file.mimetype, threadID
      );

      res.json({
        success: true,
        id: data.id,
        messageID: data.messageID,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        contentType: req.file.mimetype,
      });
    } else {
      // Legacy upload without thread context (may fail with group auth)
      const form = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      form.append('file', blob, req.file.originalname);
      form.append('data', JSON.stringify({}));

      const tzRes = await fetch(`${TRAINERIZE_API}/file/upload`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: TRAINERIZE_AUTH },
        body: form,
      });

      const responseText = await tzRes.text();
      if (!tzRes.ok) {
        throw new Error(`Trainerize file/upload responded ${tzRes.status}: ${responseText}`);
      }

      let data;
      try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }

      res.json({
        success: true,
        fileToken: data.fileToken || data.token || null,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        contentType: req.file.mimetype,
        response: data,
      });
    }
  } catch (err) {
    console.error('[File Upload] Error:', err.message);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ─── DIRECT MESSAGES ────────────────────────────────────────

// GET /api/messages/threads - fetch all message threads
router.get('/threads', async (req, res) => {
  try {
    const data = await trainerizePost('/message/getThreads', {
      view: 'inbox',
      start: 0,
      count: 100,
    });

    const threads = (data.threads || []).map(t => {
      const users = (t.ccUsers || []).filter(u => u.userID);
      return {
        threadID: t.threadID,
        users,
        lastSentTime: t.lastSentTime,
        subject: t.subject,
        excerpt: t.excerpt,
        threadType: t.threadType,
        unreadCount: t.totalUnreadMessages || 0,
        status: t.status,
      };
    });

    const trainerizeIds = [];
    for (const t of threads) {
      for (const u of t.users) {
        trainerizeIds.push(String(u.userID));
      }
    }

    let clientMap = {};
    if (trainerizeIds.length > 0) {
      const clientResult = await pool.query(
        `SELECT id, name, trainerize_id FROM clients WHERE trainerize_id = ANY($1) AND coach_id = $2`,
        [trainerizeIds, COACH_ID]
      );
      for (const row of clientResult.rows) {
        clientMap[row.trainerize_id] = { id: row.id, name: row.name };
      }
    }

    const enriched = threads.map(t => {
      const clientUser = t.users.find(u => clientMap[String(u.userID)]);
      const client = clientUser ? clientMap[String(clientUser.userID)] : null;
      return {
        threadID: t.threadID,
        clientId: client?.id || null,
        clientName: client?.name || t.subject || 'Unknown',
        lastSentTime: t.lastSentTime,
        excerpt: t.excerpt,
        unreadCount: t.unreadCount,
        status: t.status,
        threadType: t.threadType,
      };
    });

    const dmThreads = enriched.filter(t => t.clientId !== null);
    res.json({ threads: dmThreads });
  } catch (err) {
    console.error('Error fetching message threads:', err.message);
    res.status(500).json({ error: 'Failed to fetch message threads' });
  }
});

// GET /api/messages/thread/:threadId - fetch messages in a thread
router.get('/thread/:threadId', async (req, res) => {
  const { threadId } = req.params;
  try {
    const data = await trainerizePost('/message/getMessages', {
      threadID: Number(threadId),
      start: 0,
      count: 200,
    });

    const messages = (data.messages || []).map(m => ({
      messageID: m.messageID,
      body: m.body,
      sentTime: m.sentTime,
      sender: m.sender ? {
        id: m.sender.id,
        firstName: m.sender.firstName,
        lastName: m.sender.lastName,
        type: m.sender.type,
      } : null,
      type: m.type,
      attachment: m.attachment ? {
        id: m.attachment.id,
        fileName: m.attachment.fileName,
        fileToken: m.attachment.fileToken,
        contentType: m.attachment.contentType,
        fileSize: m.attachment.fileSize,
        storageType: m.attachment.storageType,
      } : null,
    }));

    // Find client for this thread to get scheduled messages
    const threadData = await trainerizePost('/message/getThreads', {
      view: 'inbox',
      start: 0,
      count: 100,
    });
    const thread = (threadData.threads || []).find(t => t.threadID === Number(threadId));
    let scheduledMessages = [];
    if (thread) {
      const userIds = (thread.ccUsers || []).map(u => String(u.userID));
      if (userIds.length > 0) {
        const clientResult = await pool.query(
          `SELECT id FROM clients WHERE trainerize_id = ANY($1) AND coach_id = $2`,
          [userIds, COACH_ID]
        );
        if (clientResult.rows.length > 0) {
          const clientId = clientResult.rows[0].id;
          const schedResult = await pool.query(
            `SELECT id, body, send_at, status, file_token, file_name, created_at
             FROM scheduled_messages
             WHERE client_id = $1 AND coach_id = $2 AND status IN ('pending', 'failed')
             ORDER BY send_at ASC`,
            [clientId, COACH_ID]
          );
          scheduledMessages = schedResult.rows.map(r => ({
            id: r.id,
            body: r.body,
            sendAt: r.send_at,
            status: r.status,
            fileToken: r.file_token,
            fileName: r.file_name,
            createdAt: r.created_at,
          }));
        }
      }
    }

    res.json({ messages, scheduledMessages });
  } catch (err) {
    console.error('Error fetching thread messages:', err.message);
    res.status(500).json({ error: 'Failed to fetch thread messages' });
  }
});

// POST /api/messages/send - send a message to a client
router.post('/send', async (req, res) => {
  const { clientId, body, threadId, fileToken } = req.body;

  if (!clientId || !body) {
    return res.status(400).json({ error: 'clientId and body are required' });
  }

  try {
    const clientResult = await pool.query(
      `SELECT trainerize_id FROM clients WHERE id = $1 AND coach_id = $2`,
      [clientId, COACH_ID]
    );
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const trainerizeId = Number(clientResult.rows[0].trainerize_id);

    let payload;
    let result;
    if (threadId) {
      payload = { threadID: Number(threadId), body, type: 'text' };
      if (fileToken) payload.fileToken = fileToken;
      result = await trainerizePost('/message/reply', payload);
    } else {
      payload = {
        recipients: [trainerizeId],
        body,
        threadType: 'mainThread',
        conversationType: 'single',
        type: 'text',
      };
      if (fileToken) payload.fileToken = fileToken;
      result = await trainerizePost('/message/send', payload);
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('Error sending message:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/messages/schedule - schedule a message for later
router.post('/schedule', async (req, res) => {
  const { clientId, body, sendAt, threadId, fileToken, fileName } = req.body;

  if (!clientId || !body || !sendAt) {
    return res.status(400).json({ error: 'clientId, body, and sendAt are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO scheduled_messages (coach_id, client_id, body, send_at, trainerize_thread_id, file_token, file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, client_id, body, send_at, status, trainerize_thread_id, file_token, file_name, created_at`,
      [COACH_ID, clientId, body, sendAt, threadId || null, fileToken || null, fileName || null]
    );

    const row = result.rows[0];
    res.json({
      id: row.id,
      clientId: row.client_id,
      body: row.body,
      sendAt: row.send_at,
      status: row.status,
      threadId: row.trainerize_thread_id,
      fileToken: row.file_token,
      fileName: row.file_name,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('Error scheduling message:', err.message);
    res.status(500).json({ error: 'Failed to schedule message' });
  }
});

// GET /api/messages/scheduled - get all pending/failed scheduled messages
router.get('/scheduled', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sm.id, sm.client_id, c.name AS client_name, sm.body, sm.send_at, sm.status, sm.file_token, sm.file_name, sm.created_at
       FROM scheduled_messages sm
       JOIN clients c ON c.id = sm.client_id
       WHERE sm.coach_id = $1 AND sm.status IN ('pending', 'failed')
       ORDER BY sm.send_at ASC`,
      [COACH_ID]
    );

    res.json({
      scheduled: result.rows.map(r => ({
        id: r.id,
        clientId: r.client_id,
        clientName: r.client_name,
        body: r.body,
        sendAt: r.send_at,
        status: r.status,
        fileToken: r.file_token,
        fileName: r.file_name,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Error fetching scheduled messages:', err.message);
    res.status(500).json({ error: 'Failed to fetch scheduled messages' });
  }
});

// DELETE /api/messages/scheduled/:id - cancel a scheduled message
router.delete('/scheduled/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM scheduled_messages WHERE id = $1 AND coach_id = $2 AND status IN ('pending', 'failed') RETURNING id`,
      [id, COACH_ID]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled message not found or already sent' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting scheduled message:', err.message);
    res.status(500).json({ error: 'Failed to delete scheduled message' });
  }
});

// POST /api/messages/scheduled/:id/retry - retry a failed scheduled message
router.post('/scheduled/:id/retry', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE scheduled_messages SET status = 'pending', send_at = now()
       WHERE id = $1 AND coach_id = $2 AND status = 'failed'
       RETURNING id, status`,
      [id, COACH_ID]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Failed message not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error retrying message:', err.message);
    res.status(500).json({ error: 'Failed to retry message' });
  }
});

// ─── GROUP POSTS / SCHEDULED POSTS ─────────────────────────

// GET /api/messages/groups
router.get('/groups', async (req, res) => {
  try {
    const data = await trainerizePost('/userGroup/getList', {
      view: 'mine',
      start: 0,
      count: 50,
    });

    const groups = (data.userGroups || []).map(g => ({
      id: g.id,
      name: g.name,
      threadID: g.threadID,
      type: g.type,
    }));

    res.json({ groups });
  } catch (err) {
    console.error('Error fetching groups:', err.message);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// POST /api/messages/post - immediately send a post to a group thread
// Supports file attachment via multipart/form-data (file field + groupThreadId + body in form)
// OR JSON body with { groupThreadId, body } for text-only posts
router.post('/post', upload.single('file'), async (req, res) => {
  const groupThreadId = req.body.groupThreadId;
  const body = req.body.body;

  if (!groupThreadId || !body) {
    return res.status(400).json({ error: 'groupThreadId and body are required' });
  }

  try {
    // If a file is attached, upload it as a messageAttachment first
    if (req.file) {
      console.log('[Group Post] Uploading attachment:', req.file.originalname, 'to thread', groupThreadId);
      const uploadResult = await trainerizeUploadAttachment(
        req.file.buffer, req.file.originalname, req.file.mimetype, groupThreadId
      );
      console.log('[Group Post] Attachment uploaded, messageID:', uploadResult.messageID);
    }

    // Send the text body as a reply
    const payload = { threadID: Number(groupThreadId), body, type: 'text' };
    console.log('[Group Post] Sending text reply:', JSON.stringify(payload, null, 2));

    const result = await trainerizePost('/message/reply', payload);
    console.log('[Group Post] Reply sent, messageID:', result.messageID);

    res.json({ success: true, result });
  } catch (err) {
    console.error('[Group Post] Error posting to group:', err.message);
    res.status(500).json({ error: 'Failed to post to group' });
  }
});

// POST /api/messages/post/schedule - schedule a group post (supports file via multipart)
router.post('/post/schedule', upload.single('file'), async (req, res) => {
  const { groupId, groupThreadId, body, sendAt } = req.body;

  if (!groupId || !groupThreadId || !body || !sendAt) {
    return res.status(400).json({ error: 'groupId, groupThreadId, body, and sendAt are required' });
  }

  try {
    const fileData = req.file ? req.file.buffer : null;
    const fileName = req.file ? req.file.originalname : (req.body.fileName || null);
    const fileContentType = req.file ? req.file.mimetype : null;

    const result = await pool.query(
      `INSERT INTO scheduled_posts (coach_id, group_id, group_thread_id, body, send_at, file_name, file_data, file_content_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, group_id, group_thread_id, body, send_at, status, file_name, created_at`,
      [COACH_ID, groupId, groupThreadId, body, sendAt, fileName, fileData, fileContentType]
    );

    const row = result.rows[0];
    res.json({
      id: row.id,
      groupId: row.group_id,
      groupThreadId: row.group_thread_id,
      body: row.body,
      sendAt: row.send_at,
      status: row.status,
      fileName: row.file_name,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('Error scheduling post:', err.message);
    res.status(500).json({ error: 'Failed to schedule post' });
  }
});

// POST /api/messages/post/schedule/batch - schedule multiple posts at once
router.post('/post/schedule/batch', async (req, res) => {
  const { posts } = req.body;

  if (!Array.isArray(posts) || posts.length === 0) {
    return res.status(400).json({ error: 'posts array is required' });
  }

  try {
    const results = [];
    for (const p of posts) {
      if (!p.groupId || !p.groupThreadId || !p.body || !p.sendAt) continue;
      const result = await pool.query(
        `INSERT INTO scheduled_posts (coach_id, group_id, group_thread_id, body, send_at, file_token, file_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, group_id, group_thread_id, body, send_at, status, file_token, file_name, created_at`,
        [COACH_ID, p.groupId, p.groupThreadId, p.body, p.sendAt, p.fileToken || null, p.fileName || null]
      );
      results.push(result.rows[0]);
    }

    res.json({
      success: true,
      count: results.length,
      posts: results.map(r => ({
        id: r.id,
        groupId: r.group_id,
        body: r.body,
        sendAt: r.send_at,
        status: r.status,
      })),
    });
  } catch (err) {
    console.error('Error batch scheduling posts:', err.message);
    res.status(500).json({ error: 'Failed to batch schedule posts' });
  }
});

// GET /api/messages/posts/scheduled - get upcoming scheduled posts
router.get('/posts/scheduled', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, group_id, group_thread_id, body, send_at, status, file_token, file_name, created_at
       FROM scheduled_posts
       WHERE coach_id = $1 AND status IN ('pending', 'failed')
       ORDER BY send_at ASC`,
      [COACH_ID]
    );

    res.json({
      scheduled: result.rows.map(r => ({
        id: r.id,
        groupId: r.group_id,
        groupThreadId: r.group_thread_id,
        body: r.body,
        sendAt: r.send_at,
        status: r.status,
        fileToken: r.file_token,
        fileName: r.file_name,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Error fetching scheduled posts:', err.message);
    res.status(500).json({ error: 'Failed to fetch scheduled posts' });
  }
});

// PUT /api/messages/posts/scheduled/:id - edit a scheduled post
router.put('/posts/scheduled/:id', async (req, res) => {
  const { id } = req.params;
  const { body, sendAt, fileToken, fileName } = req.body;

  try {
    const sets = [];
    const vals = [COACH_ID, id];
    let idx = 3;

    if (body !== undefined) { sets.push(`body = $${idx++}`); vals.push(body); }
    if (sendAt !== undefined) { sets.push(`send_at = $${idx++}`); vals.push(sendAt); }
    if (fileToken !== undefined) { sets.push(`file_token = $${idx++}`); vals.push(fileToken); }
    if (fileName !== undefined) { sets.push(`file_name = $${idx++}`); vals.push(fileName); }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const result = await pool.query(
      `UPDATE scheduled_posts SET ${sets.join(', ')}
       WHERE coach_id = $1 AND id = $2 AND status = 'pending'
       RETURNING id, group_id, group_thread_id, body, send_at, status, file_token, file_name, created_at`,
      vals
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled post not found or already sent' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      groupId: row.group_id,
      groupThreadId: row.group_thread_id,
      body: row.body,
      sendAt: row.send_at,
      status: row.status,
      fileToken: row.file_token,
      fileName: row.file_name,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('Error updating scheduled post:', err.message);
    res.status(500).json({ error: 'Failed to update scheduled post' });
  }
});

// DELETE /api/messages/posts/scheduled/:id - soft delete (cancel) a scheduled post
router.delete('/posts/scheduled/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE scheduled_posts SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND coach_id = $2 AND status = 'pending'
       RETURNING id`,
      [id, COACH_ID]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled post not found or already sent' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling scheduled post:', err.message);
    res.status(500).json({ error: 'Failed to cancel scheduled post' });
  }
});

// GET /api/messages/posts/cancelled - get all cancelled posts
router.get('/posts/cancelled', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, group_id, group_thread_id, body, send_at, status, file_token, file_name, cancelled_at, created_at
       FROM scheduled_posts
       WHERE coach_id = $1 AND status = 'cancelled'
       ORDER BY cancelled_at DESC`,
      [COACH_ID]
    );

    res.json({
      cancelled: result.rows.map(r => ({
        id: r.id,
        groupId: r.group_id,
        groupThreadId: r.group_thread_id,
        body: r.body,
        sendAt: r.send_at,
        status: r.status,
        fileToken: r.file_token,
        fileName: r.file_name,
        cancelledAt: r.cancelled_at,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Error fetching cancelled posts:', err.message);
    res.status(500).json({ error: 'Failed to fetch cancelled posts' });
  }
});

// PUT /api/messages/posts/cancelled/:id/restore - restore a cancelled post
router.put('/posts/cancelled/:id/restore', async (req, res) => {
  const { id } = req.params;
  const { sendAt } = req.body;

  try {
    const sets = [`status = 'pending'`, `cancelled_at = NULL`];
    const vals = [COACH_ID, id];
    let idx = 3;

    if (sendAt) {
      sets.push(`send_at = $${idx++}`);
      vals.push(sendAt);
    }

    const result = await pool.query(
      `UPDATE scheduled_posts SET ${sets.join(', ')}
       WHERE coach_id = $1 AND id = $2 AND status = 'cancelled'
       RETURNING id, group_id, group_thread_id, body, send_at, status, file_token, file_name, created_at`,
      vals
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cancelled post not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      groupId: row.group_id,
      body: row.body,
      sendAt: row.send_at,
      status: row.status,
    });
  } catch (err) {
    console.error('Error restoring post:', err.message);
    res.status(500).json({ error: 'Failed to restore post' });
  }
});

// POST /api/messages/posts/scheduled/:id/retry - retry a failed post
router.post('/posts/scheduled/:id/retry', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE scheduled_posts SET status = 'pending', send_at = now()
       WHERE id = $1 AND coach_id = $2 AND status = 'failed'
       RETURNING id, status`,
      [id, COACH_ID]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Failed post not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error retrying post:', err.message);
    res.status(500).json({ error: 'Failed to retry post' });
  }
});

// GET /api/messages/posts/sent - get sent post history
router.get('/posts/sent', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, group_id, group_thread_id, body, send_at, sent_at, status, file_token, file_name, created_at
       FROM scheduled_posts
       WHERE coach_id = $1 AND status = 'sent'
       ORDER BY COALESCE(sent_at, send_at) DESC
       LIMIT 50`,
      [COACH_ID]
    );

    res.json({
      sent: result.rows.map(r => ({
        id: r.id,
        groupId: r.group_id,
        groupThreadId: r.group_thread_id,
        body: r.body,
        sendAt: r.send_at,
        sentAt: r.sent_at,
        status: r.status,
        fileToken: r.file_token,
        fileName: r.file_name,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Error fetching sent posts:', err.message);
    res.status(500).json({ error: 'Failed to fetch sent posts' });
  }
});

module.exports = router;
