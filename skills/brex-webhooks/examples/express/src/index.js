// Generated with: brex-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Brex signs webhooks the Standard Webhooks way:
//   Webhook-Id         unique message ID, the same when a message is resent
//   Webhook-Timestamp  Unix seconds of this attempt
//   Webhook-Signature  space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${Webhook-Id}.${Webhook-Timestamp}.${rawBody}`
// Key: the base64-DECODED secret from GET /v1/webhooks/secrets. Brex's guide
// shows a bare base64 secret; its API reference example shows "whsec_...".
// Strip an optional whsec_ prefix, then base64-decode.
// ---------------------------------------------------------------------------

/**
 * Verify a Brex delivery.
 *
 * @param {Buffer|string} rawBody - the exact bytes Brex sent
 * @param {object} headers - lower-cased webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - BREX_WEBHOOK_SECRET
 * @param {number|null} toleranceSeconds - optional freshness window; null = off.
 *   Brex's guide recommends one (its sample uses 60s). Brex stamps each attempt,
 *   but a delivery replayed later through a relay or queue keeps its original
 *   timestamp, so a window rejects it. Dedupe on webhook-id either way.
 * @returns {boolean}
 */
function verifyBrexWebhook(rawBody, headers, secret, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (key.length === 0) return false;
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();

  // After a key rotation Brex sends one signature per key. Accept any v1 match;
  // ignore other versions (Brex's example header includes a v2 entry).
  let ok = false;
  for (const entry of signatureHeader.split(' ')) {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) continue;
    const given = Buffer.from(signature, 'base64');
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) ok = true;
  }
  return ok;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedMessageIds = new Set();

/**
 * Brex payloads are flat: `event_type` plus IDs to look up with the Brex API.
 * Fetch details (amounts, statuses) from the matching API with an access token
 * for `company_id`.
 */
function handleEvent(event) {
  switch (event.event_type) {
    case 'TRANSFER_PROCESSED':
      console.log(`Transfer ${event.transfer_id} processed (${event.payment_type})`);
      break;
    case 'TRANSFER_FAILED':
      console.log(`Transfer ${event.transfer_id} failed (${event.payment_type})`);
      break;
    case 'EXPENSE_PAYMENT_UPDATED':
      console.log(`Expense ${event.expense_id}: ${event.payment_status} ${event.payment_type}`);
      break;
    case 'USER_UPDATED':
      console.log(`User ${event.user_id} updated: ${(event.updated_attributes || []).join(', ')}`);
      break;
    case 'REFERRAL_CREATED':
    case 'REFERRAL_ACTIVATED':
    case 'REFERRAL_APPLICATION_STATUS_CHANGED':
      console.log(`${event.event_type} for referral ${event.referral_id}`);
      break;
    case 'ACCOUNTING_RECORD_READY_FOR_EXPORT':
      // This event uses camelCase fields (accountingRecordIds, companyId).
      console.log(`${(event.accountingRecordIds || []).length} accounting records ready`);
      break;
    default:
      // Brex's enum lists more types (embedded cards, disputes, ...). Acknowledge them.
      console.log(`Unhandled Brex event type: ${event.event_type}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/brex', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BREX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BREX_WEBHOOK_SECRET is not set: rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  const tolerance = process.env.BREX_WEBHOOK_TOLERANCE_SECONDS
    ? Number(process.env.BREX_WEBHOOK_TOLERANCE_SECONDS)
    : null;
  if (!verifyBrexWebhook(req.body, headers, secret, tolerance)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Webhook-Id is the same when Brex resends a message: acknowledge duplicates.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Verify, enqueue, return 2xx fast; do the real work asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Brex event:', err);
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
    console.log(`Brex webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/brex`);
  });
}

module.exports = { app, server, verifyBrexWebhook };
