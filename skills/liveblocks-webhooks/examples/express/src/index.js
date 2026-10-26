// Generated with: liveblocks-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Liveblocks sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Liveblocks signed, whatever the content type
app.post('/webhooks/liveblocks', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LIVEBLOCKS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('LIVEBLOCKS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = readSignatureHeaders(req.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
  } catch (err) {
    console.error('Liveblocks webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (typeof event !== 'object' || event === null) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Every body is { type, data }: the event name is the camelCase top-level `type`
  const { type } = event;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Liveblocks webhook ${headers['webhook-id']}: ${type}`);

  switch (type) {
    case 'userEntered':
      console.log('User entered room:', data.roomId, data.userId, `(${data.numActiveUsers} active)`);
      break;
    case 'userLeft':
      console.log('User left room:', data.roomId, data.userId, `(${data.numActiveUsers} active)`);
      break;
    case 'storageUpdated':
      // Throttled at 60 seconds: not sent for every write
      console.log('Storage updated:', data.roomId, data.updatedAt);
      break;
    case 'roomCreated':
      console.log('Room created:', data.roomId);
      break;
    case 'roomDeleted':
      console.log('Room deleted:', data.roomId);
      break;
    case 'ydocUpdated':
      // Throttled at 60 seconds: not sent for every write
      console.log('Yjs document updated:', data.roomId, data.updatedAt);
      break;
    case 'commentCreated':
      console.log('Comment created:', data.commentId, 'in thread', data.threadId);
      break;
    case 'commentEdited':
      console.log('Comment edited:', data.commentId, 'in thread', data.threadId);
      break;
    case 'commentDeleted':
      console.log('Comment deleted:', data.commentId, 'in thread', data.threadId);
      break;
    case 'commentReactionAdded':
      console.log('Reaction added:', data.emoji, 'on comment', data.commentId);
      break;
    case 'commentReactionRemoved':
      console.log('Reaction removed:', data.emoji, 'on comment', data.commentId);
      break;
    case 'threadCreated':
      console.log('Thread created:', data.threadId);
      break;
    case 'threadDeleted':
      console.log('Thread deleted:', data.threadId);
      break;
    case 'threadMetadataUpdated':
      console.log('Thread metadata updated:', data.threadId);
      break;
    case 'commentMetadataUpdated':
      console.log('Comment metadata updated:', data.commentId);
      break;
    case 'threadMarkedAsResolved':
      console.log('Thread resolved:', data.threadId);
      break;
    case 'threadMarkedAsUnresolved':
      console.log('Thread unresolved:', data.threadId);
      break;
    case 'notification':
      // data.kind is 'thread', 'textMention' or a custom '$'-prefixed kind
      console.log('Notification:', data.kind, 'for user', data.userId);
      break;
    default:
      // The documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ received: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Liveblocks webhook server running on http://localhost:${PORT}/webhooks/liveblocks`);
  });
}

module.exports = app;
