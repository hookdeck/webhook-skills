// Generated with: google-workspace-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the channel token on a Google Workspace push notification.
 *
 * Google does NOT sign push notifications. Instead, the `token` you set in the
 * watch request (max 256 chars) is echoed back in the X-Goog-Channel-Token
 * header of every notification for that channel. Compare it (timing-safe,
 * length-checked) to your stored secret.
 *
 * @param {string|undefined} received - X-Goog-Channel-Token header value
 * @param {string|undefined} expected - your stored GOOGLE_WORKSPACE_CHANNEL_TOKEN
 * @returns {boolean}
 */
function verifyChannelToken(received, expected) {
  if (!received || !expected) {
    return false;
  }
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // crypto.timingSafeEqual throws on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Drive and Calendar notifications have an empty body (Content-Length: 0).
// Admin SDK Directory notifications carry a small JSON body. Read the raw body
// so both work, then parse JSON only if there is something to parse.
app.post(
  '/webhooks/google-workspace',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const expected = process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN;
    if (!expected) {
      console.error('GOOGLE_WORKSPACE_CHANNEL_TOKEN is not set');
      return res.status(500).send('Server misconfigured');
    }

    // Express lowercases incoming header names
    const channelId = req.get('x-goog-channel-id');
    const resourceId = req.get('x-goog-resource-id');
    const resourceState = req.get('x-goog-resource-state');
    const messageNumber = req.get('x-goog-message-number');

    if (!channelId || !resourceId || !resourceState || !messageNumber) {
      return res.status(400).send('Missing X-Goog-* headers');
    }

    // X-Goog-Channel-Token is only present if you set `token` in the watch request.
    if (!verifyChannelToken(req.get('x-goog-channel-token'), expected)) {
      console.error(`Invalid channel token for channel ${channelId}`);
      return res.status(400).send('Invalid channel token');
    }

    const notification = {
      channelId,
      resourceId,
      resourceState,
      messageNumber: Number(messageNumber),
      resourceUri: req.get('x-goog-resource-uri'),
      channelExpiration: req.get('x-goog-channel-expiration'),
      // Comma-separated list, e.g. "content,permissions" (Drive update only)
      changed: (req.get('x-goog-changed') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      body: parseBody(req.body),
    };

    handleNotification(notification);

    // Google treats 200, 201, 202, 204 and 102 as success. Respond fast and
    // fetch the actual change (files.get, changes.list, events.list) async.
    return res.status(200).send();
  }
);

function parseBody(raw) {
  if (!Buffer.isBuffer(raw) || raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Dispatch on X-Goog-Resource-State. Notifications only say *that* something
 * changed — call the API to find out *what* changed.
 */
function handleNotification(n) {
  console.log(
    `Google Workspace notification: state=${n.resourceState} channel=${n.channelId} message=${n.messageNumber}`
  );

  switch (n.resourceState) {
    // All APIs: first message on a new channel (message number is always 1)
    case 'sync':
      console.log(`Channel ${n.channelId} is active for resource ${n.resourceId}`);
      break;

    // Drive files.watch (add/update are also Admin SDK Directory user events)
    case 'add':
      console.log(`Resource created or shared: ${n.resourceUri}`);
      // Admin SDK Directory: n.body = { kind, id, etag, primaryEmail }
      break;
    case 'update':
      console.log(`Resource updated (${n.changed.join(', ') || 'unspecified'})`);
      break;
    case 'remove':
      console.log(`Resource deleted or unshared: ${n.resourceUri}`);
      break;
    case 'trash':
      console.log(`Resource moved to trash: ${n.resourceUri}`);
      break;
    case 'untrash':
      console.log(`Resource restored from trash: ${n.resourceUri}`);
      break;

    // Drive changes.watch (Google's example header shows "changed")
    case 'change':
    case 'changed':
      console.log('Changelog items added — call changes.list with your saved page token');
      break;

    // Calendar (events, ACLs, calendar lists, settings)
    case 'exists':
      console.log(`Calendar resource changed: ${n.resourceUri} — run an incremental sync`);
      break;
    case 'not_exists':
      console.log(`Calendar resource no longer exists: ${n.resourceUri}`);
      break;

    // Admin SDK Directory users.watch
    case 'delete':
    case 'undelete':
    case 'makeAdmin':
      console.log(`Directory user ${n.resourceState}: ${n.body?.primaryEmail}`);
      break;

    default:
      // Google may add new states; ignore unknown ones gracefully
      console.log(`Unhandled resource state: ${n.resourceState}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyChannelToken };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/google-workspace`);
  });
}
