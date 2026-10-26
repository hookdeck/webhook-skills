// Generated with: cloudentity-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the key's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Cloudentity (SecureAuth) does not sign payloads. Every webhook request carries
 * the Webhook API Key as plain text in the X-API-Key header. Compare the WHOLE
 * header value with the key you stored. This authenticates the sender only; it
 * says nothing about the body and gives no replay protection.
 */
function verifyCloudentityRequest(headers, apiKey = process.env.CLOUDENTITY_WEBHOOK_API_KEY) {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers['x-api-key'];
  return Boolean(received) && safeEqual(received, apiKey);
}

// The docs don't name a field that carries the event type. They say the webhook
// payload "delivers the matching field in subject_action form" (user_deleted), and
// the external-logging guide reads audit_events.payload.login_failed.cause, which
// suggests each audit event's `payload` object holds one key named for the event.
// That is an inference: confirm it against a real delivery before relying on it.
function eventName(auditEvent) {
  const { payload } = auditEvent;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const keys = Object.keys(payload);
  return keys.length === 1 ? keys[0] : undefined;
}

function handleEvent(auditEvent) {
  const name = eventName(auditEvent);

  switch (name) {
    case 'user_created':
      console.log(`User created (event ${auditEvent.event_id})`);
      // TODO: create the matching record in your CRM
      break;

    case 'user_updated':
      console.log(`User updated (event ${auditEvent.event_id})`);
      // TODO: sync profile changes
      break;

    case 'user_deleted':
      console.log(`User deleted (event ${auditEvent.event_id})`);
      // TODO: deprovision the user downstream
      break;

    case 'user_authenticated':
      console.log(`User authenticated (event ${auditEvent.event_id})`);
      // TODO: record the sign-in
      break;

    case 'group_created':
      console.log(`Group created (event ${auditEvent.event_id})`);
      // TODO: mirror the group
      break;

    case 'login_failed':
      console.log(`Login failed (event ${auditEvent.event_id})`);
      // TODO: feed your SIEM or alerting
      break;

    case 'consent_revoked':
      console.log(`Consent revoked (event ${auditEvent.event_id})`);
      // TODO: stop processing data covered by the consent
      break;

    case 'client_created':
      console.log(`Client created (event ${auditEvent.event_id})`);
      // TODO: audit the new application
      break;

    default:
      console.log(`Unhandled event: ${name}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/cloudentity', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyCloudentityRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing X-API-Key' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // SecureAuth sends audit events in batches: { "audit_events": [ ... ] }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.audit_events)) {
    return res.status(400).json({ error: 'Expected an audit_events array' });
  }

  try {
    for (const auditEvent of payload.audit_events) {
      handleEvent(auditEvent || {});
    }
  } catch (err) {
    console.error('Error handling Cloudentity events:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCloudentityRequest = verifyCloudentityRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cloudentity`);
  });
}
