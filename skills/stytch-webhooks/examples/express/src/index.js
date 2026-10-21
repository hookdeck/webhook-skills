// Generated with: stytch-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import crypto from 'node:crypto';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set STYTCH_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.STYTCH_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`STYTCH_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Svix-signed delivery (the Standard Webhooks scheme) and throw if it's invalid.
 *
 * Written out rather than calling the `svix` SDK, because the SDK always enforces a
 * 5-minute timestamp window. Hookdeck retries and replays carry the original
 * svix-timestamp, so that window would reject them. Here the window is opt-in via
 * STYTCH_TIMESTAMP_TOLERANCE_SECONDS.
 */
function verifySvixSignature(rawBody, headers, secret, toleranceSeconds = timestampToleranceSeconds()) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing Svix signature headers');
  if (!/^\d+$/.test(timestamp)) throw new Error('Invalid svix-timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  // Key = base64-decoded secret after the whsec_ prefix
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // svix-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
  const match = signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
}

// Stytch bodies carry source, object_type and action but no combined type field
export function stytchEventType(body) {
  if (!body || !body.source || !body.object_type || !body.action) return null;
  return `${body.source}.${body.object_type}.${body.action}`.toLowerCase();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Stytch (Svix) signed
app.post('/webhooks/stytch', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.STYTCH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('STYTCH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature. The timestamp window is opt-in (STYTCH_TIMESTAMP_TOLERANCE_SECONDS).
    verifySvixSignature(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }, secret);
  } catch (err) {
    console.error('Stytch webhook verification failed:', err.message);
    const error = /outside tolerance/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const type = stytchEventType(event);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Stytch webhook ${svixId}: ${type}`);

  // Webhooks are unordered: treat them as a signal and re-fetch from the Stytch API
  switch (type) {
    case 'direct.user.create':
      console.log('User created:', event.id);
      break;
    case 'direct.user.update':
      console.log('User updated:', event.id);
      break;
    case 'direct.organization.create':
    case 'dashboard.organization.create':
      console.log('Organization created:', event.id);
      break;
    case 'direct.member.update':
    case 'scim.member.update':
      console.log('Member updated:', event.id);
      break;
    case 'direct.saml_connection.delete':
      // DELETE events carry only the id, no entity object
      console.log('SAML connection deleted:', event.id);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Stytch webhook server running on http://localhost:${PORT}/webhooks/stytch`);
  });
}
