// Generated with: scalekit-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Scalekit (scalekit.com) signs webhooks with Standard Webhooks:
//   webhook-id         the delivery ID (stable across retries)
//   webhook-timestamp  Unix seconds when this attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Read the signature headers. Standard Webhooks uses webhook-*; when
 * webhook-id is absent, fall back to the svix-* names, as Hookdeck does.
 * Returns them under the webhook-* names the library expects.
 */
function readSignatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': get(`${prefix}-id`),
    'webhook-timestamp': get(`${prefix}-timestamp`),
    'webhook-signature': get(`${prefix}-signature`),
  };
}

/**
 * Verify a Scalekit delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string} rawBody - the exact body Scalekit sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyScalekitWebhook(rawBody, headers, secret = process.env.SCALEKIT_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The top-level evt_ id (and webhook-id) is the same on every retry.
const processedEventIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    // --- Organizations -----------------------------------------------------
    case 'organization.created':
    case 'organization.updated':
    case 'organization.deleted':
      console.log(`${type}: ${data.id} (${data.display_name})`);
      break;

    // --- Directory sync (SCIM) ---------------------------------------------
    case 'organization.directory_enabled':
    case 'organization.directory_disabled':
      console.log(`${type}: ${event.organization_id}`);
      break;
    case 'organization.directory.user_created':
    case 'organization.directory.user_updated':
      console.log(`${type}: ${data.id} (${data.email}, active=${data.active})`);
      break;
    case 'organization.directory.user_deleted':
      console.log(`Directory user deleted: ${data.id} (${data.email})`);
      break;
    case 'organization.directory.group_created':
    case 'organization.directory.group_updated':
    case 'organization.directory.group_deleted':
      console.log(`${type}: ${data.id} (${data.display_name})`);
      break;

    // --- SSO connections ---------------------------------------------------
    case 'organization.sso_enabled':
    case 'organization.sso_disabled':
      console.log(`${type}: ${event.organization_id}`);
      break;

    // --- Users (no organization_id on user.* events) -----------------------
    case 'user.signup':
    case 'user.login':
    case 'user.logout':
      console.log(`${type}: ${data.id ?? data.user?.id}`);
      break;
    case 'user.organization_membership_created':
    case 'user.organization_membership_updated':
    case 'user.organization_membership_deleted':
      console.log(`${type}: ${data.id ?? data.user?.id}`);
      break;

    // --- Roles -------------------------------------------------------------
    case 'role.created':
    case 'role.updated':
      console.log(`${type}: ${data.name ?? data.id}`);
      break;

    default:
      // Scalekit's event list may grow: acknowledge, don't fail.
      console.log(`Unhandled Scalekit event type: ${type}`);
  }
}

// scalekit webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break it.
app.post('/webhooks/scalekit', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.SCALEKIT_WEBHOOK_SECRET) {
    console.error('SCALEKIT_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = readSignatureHeaders((name) => req.get(name));
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing Standard Webhooks signature headers' });
  }

  let event;
  try {
    event = verifyScalekitWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Scalekit webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same event id and webhook-id; acknowledge duplicates with 200.
  const eventId = event.id || headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Scalekit needs a 2xx within 30 seconds. In production, enqueue the event
    // here and process it asynchronously. Deliveries are unordered: compare
    // event.occurred_at before overwriting newer data.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Scalekit event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`scalekit webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/scalekit`);
  });
}

module.exports = { app, server, verifyScalekitWebhook, readSignatureHeaders };
