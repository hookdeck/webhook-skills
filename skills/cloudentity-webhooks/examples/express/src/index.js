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

// Each audit event carries its type twice: as `event_subject` and `action`
// (login + accepted), and as the single key of its `payload` object, named
// <subject>_<action> (login_accepted). Dispatch on the payload key, which is
// also where the event's data lives.
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
      // Create the matching record in your CRM.
      break;

    case 'user_updated':
      console.log(`User updated (event ${auditEvent.event_id})`);
      // Sync the profile changes.
      break;

    case 'user_deleted':
      console.log(`User deleted (event ${auditEvent.event_id})`);
      // Deprovision the user downstream.
      break;

    case 'user_authenticated':
      console.log(`User authenticated (event ${auditEvent.event_id})`);
      // Record the sign-in.
      break;

    case 'group_created':
      console.log(`Group created (event ${auditEvent.event_id})`);
      // Mirror the group.
      break;

    case 'login_failed':
      console.log(`Login failed (event ${auditEvent.event_id})`);
      // Feed your SIEM or alerting.
      break;

    case 'consent_revoked':
      console.log(`Consent revoked (event ${auditEvent.event_id})`);
      // Stop processing data covered by the consent.
      break;

    case 'client_created':
      console.log(`Client created (event ${auditEvent.event_id})`);
      // Audit the new application.
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
