// Generated with: flutterwave-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Flutterwave has two webhook schemes, both still supported:
//   v4  flutterwave-signature = base64(HMAC-SHA256(key = secret hash, raw body))
//   v3  verif-hash            = the secret hash itself (no signature)
// If flutterwave-signature is present, verify v4 and don't fall back to v3.
//
// Flutterwave's v4 docs contradict themselves: the "Sample hashing" helper
// signs the raw body, but later framework examples compare the header to the
// secret hash directly. This follows the HMAC helper.
// ---------------------------------------------------------------------------

/** Constant-time comparison of two strings via equal-length SHA-256 digests. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Verify a Flutterwave delivery.
 *
 * @param {Buffer|string} rawBody - the exact bytes Flutterwave sent
 * @param {object} headers - lower-cased request headers
 * @param {string|undefined} secretHash - FLUTTERWAVE_SECRET_HASH
 * @returns {'v4'|'v3'|null} the scheme that verified, or null
 */
function verifyFlutterwaveWebhook(rawBody, headers, secretHash) {
  if (!secretHash) return null;

  const signature = headers['flutterwave-signature'];
  if (signature) {
    const expected = crypto.createHmac('sha256', secretHash).update(rawBody).digest();
    const given = Buffer.from(String(signature), 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? 'v4' : null;
  }

  const verifHash = headers['verif-hash'];
  if (verifHash && safeEqual(verifHash, secretHash)) return 'v3';
  return null;
}

/**
 * Key for skipping duplicates: the v4 webhook ID (the webhooks page calls it
 * `id`, other v4 pages `webhook_id`); for v3, event + data.id + data.status as
 * Flutterwave suggests; otherwise a hash of the body.
 */
function dedupeKey(event, rawBody) {
  if (event.type && (event.webhook_id || event.id)) return `v4:${event.webhook_id || event.id}`;
  if (event.event && event.data) return `v3:${event.event}:${event.data.id}:${event.data.status}`;
  return `body:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedKeys = new Set();

function handleEvent(event) {
  const name = event.type || event.event; // v4 uses `type`, v3 uses `event`
  const data = event.data || {};
  switch (name) {
    case 'charge.completed':
      // Re-query the charge through the API before giving value.
      console.log(`Charge ${data.id} ${data.status}: ${data.amount} ${data.currency}`);
      break;
    case 'transfer.disburse': // v4
    case 'transfer.completed': // v3
      console.log(`Transfer ${data.id} ${data.status}`);
      break;
    case 'transfer.reversal':
      console.log(`Transfer ${data.id} reversed`);
      break;
    case 'refund.completed':
      console.log(`Refund ${data.id} ${data.status} for charge ${data.charge_id}`);
      break;
    case 'subscription.cancelled':
      console.log(`Subscription cancelled for ${data.customer && data.customer.email}`);
      break;
    case undefined:
      // Some v3 payloads have no event field: virtual card notifications and refunds.
      if (event.CardId) console.log(`Virtual card ${event.CardId}: ${event.Type} ${event.Status}`);
      else if (event.AmountRefunded !== undefined) console.log(`Refund ${event.id} ${event.status}`);
      else console.log('Flutterwave webhook without an event type');
      break;
    default:
      console.log(`Unhandled Flutterwave event: ${name}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/flutterwave', express.raw({ type: '*/*' }), (req, res) => {
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  if (!secretHash) {
    console.error('FLUTTERWAVE_SECRET_HASH is not set: rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const version = verifyFlutterwaveWebhook(rawBody, req.headers, secretHash);
  if (!version) {
    // Flutterwave's samples return 401 for a bad signature.
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const key = dedupeKey(event, rawBody);
  if (processedKeys.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Respond within 60 seconds: verify, enqueue, return 200, work asynchronously.
    handleEvent(event);
    processedKeys.add(key);
  } catch (err) {
    console.error('Error handling Flutterwave event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // Exactly 200: Flutterwave treats any other status, 201 and 3xx included, as a failure.
  return res.status(200).json({ received: true, version });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Flutterwave webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/flutterwave`);
  });
}

module.exports = { app, verifyFlutterwaveWebhook, dedupeKey };
