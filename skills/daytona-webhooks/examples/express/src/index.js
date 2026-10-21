// Generated with: daytona-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set DAYTONA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.DAYTONA_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`DAYTONA_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// ---------------------------------------------------------------------------
// Daytona's webhook docs don't describe signing. Deliveries go through Svix:
//   svix-id         message ID (same on retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify a Svix-signed delivery (the Standard Webhooks scheme) and throw if it's invalid.
 *
 * Written out rather than calling the `svix` SDK, because the SDK always enforces a
 * 5-minute timestamp window. Hookdeck retries and replays carry the original
 * svix-timestamp, so that window would reject them. Here the window is opt-in via
 * DAYTONA_TIMESTAMP_TOLERANCE_SECONDS.
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

/**
 * Verify a Daytona delivery and return the parsed payload.
 *
 * @param {Buffer|string} rawBody - the exact bytes Daytona sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified payload
 * @throws {Error} if the signature (or, when opted in, the timestamp) is invalid
 */
export function verifyDaytonaWebhook(rawBody, headers, secret = process.env.DAYTONA_WEBHOOK_SECRET) {
  verifySvixSignature(rawBody, headers, secret);
  return JSON.parse(rawBody.toString('utf8'));
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The payload has no event ID, so dedupe on svix-id (stable across retries).
const processedMessageIds = new Set();

function handleEvent(payload) {
  switch (payload.event) {
    case 'sandbox.created':
      console.log(`Sandbox ${payload.id} created in org ${payload.organizationId} (${payload.sandboxClass}, ${payload.state})`);
      break;
    case 'sandbox.state.updated':
      console.log(`Sandbox ${payload.id}: ${payload.oldState} → ${payload.newState}`);
      break;
    case 'snapshot.created':
      console.log(`Snapshot ${payload.name} (${payload.id}) created, state ${payload.state}`);
      break;
    case 'snapshot.state.updated':
      console.log(`Snapshot ${payload.name} (${payload.id}): ${payload.oldState} → ${payload.newState}`);
      break;
    case 'snapshot.removed':
      console.log(`Snapshot ${payload.name} (${payload.id}) removed at ${payload.removedAt}`);
      break;
    case 'volume.created':
      console.log(`Volume ${payload.name} (${payload.id}) created, state ${payload.state}`);
      break;
    case 'volume.state.updated':
      console.log(`Volume ${payload.name} (${payload.id}): ${payload.oldState} → ${payload.newState}`);
      break;
    default:
      console.log(`Unhandled Daytona event: ${payload.event}`);
  }
}

// Daytona webhook endpoint — express.raw() keeps the exact bytes for the HMAC.
// express.json() before verification would break the signature.
app.post('/webhooks/daytona', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.DAYTONA_WEBHOOK_SECRET) {
    console.error('DAYTONA_WEBHOOK_SECRET is not set — rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'svix-id': req.get('svix-id'),
    'svix-timestamp': req.get('svix-timestamp'),
    'svix-signature': req.get('svix-signature'),
  };
  if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
    return res.status(400).json({ error: 'Missing Svix signature headers' });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  let payload;
  try {
    payload = verifyDaytonaWebhook(req.body, headers);
  } catch (err) {
    console.error('Daytona webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedMessageIds.has(headers['svix-id'])) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(headers['svix-id']);
  } catch (err) {
    console.error('Error handling Daytona event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export { app };

// Start the server only when run directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Daytona webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/daytona`);
  });
}
