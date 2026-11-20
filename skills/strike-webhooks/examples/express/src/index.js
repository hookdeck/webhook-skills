// Generated with: strike-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const STRIKE_API_BASE = process.env.STRIKE_API_BASE || 'https://api.strike.me';

// ---------------------------------------------------------------------------
// Strike (strike.me, Bitcoin/Lightning payments) signs every webhook with
// X-Webhook-Signature: the lowercase hex HMAC-SHA256 of the raw request body,
// keyed with the `secret` YOU chose when creating the subscription
// (POST /v1/subscriptions). Not the API key. No timestamp, no prefix.
// ---------------------------------------------------------------------------

/**
 * Verify X-Webhook-Signature against the exact bytes Strike sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Webhook-Signature header
 * @param {string[]} secrets - current secret, plus the previous one during a rotation
 * @returns {boolean}
 */
function verifyStrikeSignature(rawBody, signature, secrets) {
  // SHA-256 is 32 bytes: 64 hex characters. Anything else is rejected up front,
  // so timingSafeEqual never sees buffers of different lengths (it would throw).
  const value = String(signature || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const received = Buffer.from(value, 'hex');
  return secrets.some((secret) => {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    return crypto.timingSafeEqual(received, expected);
  });
}

// The 14 event types in Strike's "Supported Events" table, mapped to the API
// path that resolves data.entityId. Webhooks carry no entity data: fetch it.
const EVENT_RESOURCES = {
  'invoice.created': '/v1/invoices',
  'invoice.updated': '/v1/invoices',
  'payment-method.bank.created': '/v1/payment-methods/bank',
  'payment-method.bank.updated': '/v1/payment-methods/bank',
  'payout.created': '/v1/payouts',
  'payout.updated': '/v1/payouts',
  'payout-originator.created': '/v1/payout-originators',
  'payout-originator.updated': '/v1/payout-originators',
  'currency-exchange-quote.updated': '/v1/currency-exchange-quotes',
  'payment.created': '/v1/payments',
  'payment.updated': '/v1/payments',
  'deposit.updated': '/v1/deposits',
  'receive-request.receive-pending': '/v1/receive-requests',
  'receive-request.receive-completed': '/v1/receive-requests',
};

// Demo-only dedupe store. Use a database unique constraint on event.id in production.
const seenEventIds = new Set();

/**
 * Runs AFTER the 200 has been sent. Strike cancels a delivery after 5 seconds,
 * so the fetch-back API call must never happen before responding.
 */
async function processEvent(event) {
  const basePath = EVENT_RESOURCES[event.eventType];
  const entityId = event.data?.entityId;
  if (!basePath || !entityId) return null;

  const apiKey = process.env.STRIKE_API_KEY;
  if (!apiKey) {
    console.error('STRIKE_API_KEY is not set: cannot fetch the entity for', event.id);
    return null;
  }

  const res = await fetch(`${STRIKE_API_BASE}${basePath}/${encodeURIComponent(entityId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Strike API ${res.status} for ${event.eventType} ${entityId}`);
  const entity = await res.json();

  // The fetched entity is the source of truth. Deliveries can repeat and arrive
  // out of order, so don't rebuild state from the sequence of events.
  const changes = event.data?.changes ?? []; // only on *.updated events
  console.log(`${event.eventType} ${entityId} changed [${changes.join(', ')}]`, entity);
  return entity;
}

// Swappable so tests (or a real queue) can take over.
let enqueue = (event) => {
  setImmediate(() => {
    processEvent(event).catch((err) => console.error('Strike event processing failed:', err));
  });
};

// express.raw() keeps the exact bytes for the HMAC: don't use express.json() here.
app.post('/webhooks/strike', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secrets = [process.env.STRIKE_WEBHOOK_SECRET, process.env.STRIKE_WEBHOOK_SECRET_PREVIOUS]
    .filter((s) => typeof s === 'string' && s.length > 0);
  if (secrets.length === 0) {
    // Fail closed: never skip verification because the secret is missing.
    console.error('STRIKE_WEBHOOK_SECRET is not set: rejecting webhook');
    return res.status(401).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyStrikeSignature(rawBody, req.get('X-Webhook-Signature'), secrets)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!event || typeof event !== 'object' || typeof event.id !== 'string') {
    return res.status(400).json({ error: 'Not a Strike webhook event' });
  }

  // Only the v1 payload is documented. Make a version change loud, not silent.
  // The event stays recoverable via GET /v1/events for 30 days.
  if (event.webhookVersion !== 'v1') {
    console.error(`Unsupported webhookVersion ${event.webhookVersion} on event ${event.id}`);
    return res.status(200).json({ received: true, id: event.id, ignored: 'unsupported webhookVersion' });
  }

  if (seenEventIds.has(event.id)) {
    return res.status(200).json({ received: true, id: event.id, duplicate: true });
  }
  seenEventIds.add(event.id);

  if (!EVENT_RESOURCES[event.eventType]) {
    // Strike can add event types within v1 without notice: acknowledge, don't 4xx.
    console.log(`Ignoring unknown Strike eventType ${event.eventType}`);
    return res.status(200).json({ received: true, id: event.id, ignored: 'unknown eventType' });
  }

  // Respond first (5-second timeout), fetch the entity afterwards.
  res.status(200).json({ received: true, id: event.id, eventType: event.eventType });
  enqueue(event);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Strike webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/strike`);
  });
}

module.exports = {
  app,
  verifyStrikeSignature,
  processEvent,
  EVENT_RESOURCES,
  seenEventIds,
  setEnqueue: (fn) => {
    enqueue = fn;
  },
};
