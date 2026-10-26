// Generated with: isnap-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// iSnap sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    'webhook-id': headers[`${prefix}-id`],
    'webhook-timestamp': headers[`${prefix}-timestamp`],
    'webhook-signature': headers[`${prefix}-signature`],
  };
}

// ISNAP_WEBHOOK_SECRET is one whsec_ secret, or a comma-separated list while you rotate:
// iSnap signs with the new secret only, from the moment you rotate
function readSecrets() {
  const secrets = (process.env.ISNAP_WEBHOOK_SECRET || '').split(',').map((s) => s.trim()).filter(Boolean);
  return secrets.length > 0 && secrets.every((s) => s.startsWith('whsec_')) ? secrets : null;
}

// Demo only: use a database or cache with a TTL in production
const seenEventIds = new Set();

// IMPORTANT: express.raw() keeps the exact bytes iSnap signed, whatever the content type
app.post('/webhooks/isnap', express.raw({ type: '*/*' }), (req, res) => {
  const secrets = readSecrets();
  if (!secrets) {
    console.error('ISNAP_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = readSignatureHeaders(req.headers);
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
  // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
  const verified = secrets.some((secret) => {
    try {
      new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
      return true;
    } catch {
      return false;
    }
  });
  if (!verified) {
    console.error('iSnap webhook verification failed');
    // Never answer 410: iSnap turns the subscription off
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

  // The envelope is { api_version, event_id, event_type, created_at, trace_id, data };
  // event_id equals the webhook-id header and is the dedupe key
  const { event_id: eventId = headers['webhook-id'], event_type: type } = event;
  const data = event.data ?? {};

  if (seenEventIds.has(eventId)) {
    console.log(`Duplicate iSnap event ${eventId}: ${type}`);
    return res.status(204).end();
  }
  seenEventIds.add(eventId);
  console.log(`Received iSnap webhook ${eventId}: ${type}`);

  // Respond first, process later: iSnap retries anything not 2xx within 10 seconds
  res.status(204).end();

  switch (type) {
    case 'message.received':
      console.log('Message received:', data.message?.id, 'in chat', data.chat_id);
      break;
    case 'message.queued':
    case 'message.scheduled':
    case 'message.sent':
    case 'message.delivered':
    case 'message.read':
    case 'message.failed':
    case 'message.cancelled':
    case 'message.fallback_triggered':
      console.log(`Message status ${type}:`, data.message?.id);
      break;
    case 'reaction.added':
    case 'reaction.received':
    case 'reaction.removed':
      console.log(`Reaction event ${type}`);
      break;
    case 'typing_indicator.started':
    case 'typing_indicator.stopped':
      console.log(`Typing indicator event ${type}`);
      break;
    case 'line.connected':
    case 'line.disconnected':
    case 'line.offline':
    case 'line.degraded':
    case 'line.apple_id_flagged':
    case 'line.quota_warning':
    case 'line.quota_exceeded':
    case 'line.capability_changed':
    case 'line.terminated':
    case 'line.variant_changed':
    case 'line.variant_scheduled':
    case 'line.variant_unscheduled':
      console.log(`Line event ${type}:`, data.line_metadata);
      break;
    case 'trial.linked':
    case 'trial.dormant':
    case 'trial.reactivated':
    case 'trial.bind_conflict':
    case 'trial.revoked':
      console.log(`Trial event ${type}`);
      break;
    case 'pre_order.fulfilled':
    case 'pre_order.cancelled':
      console.log(`Pre-order event ${type}`);
      break;
    case 'macos_session.rented':
    case 'macos_session.released':
      console.log(`macOS session event ${type}`);
      break;
    case 'binding.released':
      console.log('Binding released');
      break;
    case 'webhook.test':
      // A signed probe to a suspended subscription: a 2xx resumes it
      console.log('Probe received: subscription will resume');
      break;
    default:
      // Events can arrive out of order and the documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`iSnap webhook server running on http://localhost:${PORT}/webhooks/isnap`);
  });
}

module.exports = app;
