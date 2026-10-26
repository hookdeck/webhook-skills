// Generated with: envoy-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * ENVOY WEBHOOK VERIFICATION
 *
 * X-Envoy-Signature is the base64 HMAC-SHA256 of the raw request body, keyed
 * with your Envoy app's client secret. There is no timestamp in the signed
 * content. (Same algorithm as the official @envoy/envoy-integrations-sdk
 * EnvoySignatureVerifier.)
 */
function verifyEnvoySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Envoy webhook endpoint.
// express.raw({ type: '*/*' }) keeps the body a Buffer whatever the Content-Type,
// so the HMAC is computed over the exact bytes Envoy sent.
app.post('/webhooks/envoy', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ENVOY_CLIENT_SECRET;
  if (!secret) {
    console.error('ENVOY_CLIENT_SECRET is not set - refusing unverified webhooks');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['x-envoy-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Envoy-Signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyEnvoySignature(rawBody, signature, secret)) {
    console.error('Envoy webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log(`✓ Verified Envoy webhook: ${payload?.event ?? 'unknown'}`);

  handleEvent(payload);

  res.status(200).json({ received: true });
});

function handleEvent(payload) {
  // `event` is the topic; `payload` is the entry/invite/etc., `meta` has the location and company.
  // TODO: dedupe (e.g. on event + payload.id); Envoy retries failed deliveries.
  const { event, payload: data = {}, meta = {} } = payload || {};
  const attrs = data?.attributes || {};
  const who = attrs['full-name'] || data?.id;
  const where = meta?.location?.attributes?.name;

  switch (event) {
    // Visitors
    case 'entry_sign_in':
      console.log(`✅ Visitor signed in: ${who} at ${where}`);
      break;
    case 'entry_sign_out':
      console.log(`👋 Visitor signed out: ${who} at ${where}`);
      break;
    case 'entry_blacklist_review':
      console.log(`🔎 Visitor needs blocklist review: ${who}`);
      break;
    case 'entry_blacklist_deny':
      console.log(`⛔ Visitor denied by blocklist: ${who}`);
      break;
    case 'entry_manually_updated':
      console.log(`✏️  Entry manually updated: ${who}`);
      break;
    case 'invite_created':
      console.log(`📨 Invite created: ${who}`);
      break;
    case 'invite_updated':
      console.log(`🔄 Invite updated: ${who}`);
      break;
    case 'invite_removed':
      console.log(`🗑️  Invite removed: ${who}`);
      break;
    case 'upcoming_visit':
      console.log(`⏰ Upcoming visit: ${who}`);
      break;
    case 'qr_code_sent':
      console.log(`📧 QR code sent to: ${who}`);
      break;
    // Workplace
    case 'employee_invite_created':
      console.log(`📨 Employee invite created: ${who}`);
      break;
    case 'employee_invite_updated':
      console.log(`🔄 Employee invite updated: ${who}`);
      break;
    case 'employee_upcoming_visit':
      console.log(`⏰ Employee arriving within the hour: ${who}`);
      break;
    case 'employee_entry_sign_in':
      console.log(`✅ Employee signed in: ${who} at ${where}`);
      break;
    case 'employee_entry_sign_out':
      console.log(`👋 Employee signed out: ${who} at ${where}`);
      break;
    case 'employee_entry_blacklist_review':
      console.log(`🔎 Employee needs blocklist review: ${who}`);
      break;
    case 'employee_entry_blacklist_deny':
      console.log(`⛔ Employee denied by blocklist: ${who}`);
      break;
    case 'location_capacity_updated':
      console.log(`📊 Location capacity updated: ${where}`);
      break;
    case 'desk_sign_in':
      console.log(`🪑 Desk sign-in: ${who}`);
      break;
    case 'ticket_created':
      console.log(`🎫 Workplace ticket created: ${data?.id}`);
      break;
    default:
      console.log(`Unhandled Envoy event: ${event}`);
  }
}

module.exports = { app, verifyEnvoySignature };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Envoy webhook server listening on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/envoy`);
  });
}
