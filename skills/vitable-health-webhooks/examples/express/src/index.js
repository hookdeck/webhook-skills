// Generated with: vitable-health-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Vitable Health signs every delivery with HMAC-SHA512:
//   X-Vitable-Signature: sha512=<128 hex characters>
//   X-Vitable-Timestamp: <unix_timestamp>
// signed content = "<X-Vitable-Timestamp value>.<raw body bytes>", key = the secret's UTF-8 bytes.
// https://developer.vitablehealth.com/webhooks/signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set VITABLE_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in (Vitable's own
// examples use 300); any other value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.VITABLE_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`VITABLE_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function verifyVitable(rawBody, headers, secret) {
  if (!secret) return false;

  const signature = headers['x-vitable-signature'];
  const timestamp = headers['x-vitable-timestamp'];
  if (!signature || !timestamp) return false;

  // Accept the value with or without the sha512= prefix; hex is case-insensitive.
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  const hex = (signature.startsWith('sha512=') ? signature.slice(7) : signature).toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(hex)) return false;

  // Optional replay window; off unless VITABLE_WEBHOOK_TOLERANCE_SECONDS > 0
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  // Build the signed message as bytes: header value as received (latin1), ".", raw body.
  // The secret is used as-is: UTF-8 bytes, not hex- or base64-decoded.
  const expected = crypto
    .createHmac('sha512', secret)
    .update(Buffer.from(timestamp, 'latin1'))
    .update('.')
    .update(rawBody)
    .digest();
  const given = Buffer.from(hex, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// In-memory dedupe on event_id. Vitable delivers at-least-once; use a database or cache with a
// unique constraint in production.
const seenEvents = new Set();

// Raw body is required: the signature covers the exact bytes Vitable sent.
// type: '*/*' reads the body as a Buffer whatever the content type is.
app.post('/webhooks/vitable-health', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.VITABLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('VITABLE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyVitable(rawBody, req.headers, secret)) {
    console.error('Vitable Health webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after the signature check
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  if (event.event_id && seenEvents.has(event.event_id)) {
    return res.json({ received: true, duplicate: true });
  }

  // Events are thin: {event_id, organization_id, event_name, resource_type, resource_id, created_at}.
  // Dispatch on event_name and fetch the resource from the Vitable API with resource_id.
  switch (event.event_name) {
    case 'enrollment.accepted':
      console.log(`Enrollment accepted: ${event.resource_id} (org ${event.organization_id})`);
      break;
    case 'enrollment.terminated':
      console.log(`Enrollment terminated: ${event.resource_id} (org ${event.organization_id})`);
      break;
    case 'employee.eligibility_granted':
      console.log(`Employee eligibility granted: ${event.resource_id} (org ${event.organization_id})`);
      break;
    case 'employee.eligibility_terminated':
      console.log(`Employee eligibility terminated: ${event.resource_id} (org ${event.organization_id})`);
      break;
    case 'employee.deduction_created':
      console.log(`Payroll deduction created: ${event.resource_id} (org ${event.organization_id})`);
      break;
    default:
      // enrollment.elected, enrollment.granted, enrollment.waived, enrollment.started,
      // employee.deactivated, and any future event
      console.log(`Unhandled event: ${event.event_name}`);
  }

  if (event.event_id) seenEvents.add(event.event_id);
  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Vitable Health webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyVitable };
