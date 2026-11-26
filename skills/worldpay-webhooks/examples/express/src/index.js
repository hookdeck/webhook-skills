// Generated with: worldpay-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Access Worldpay event webhooks: the Event-Signature header
//
//   Event-Signature: {keyId}/{hashFunction}/{signature}[,{keyId}/{hashFunction}/{signature}...]
//
//   keyId        numeric reference to the shared secret that signed the message
//   hashFunction SHA256 (the only value Worldpay supports today)
//   signature    hex HMAC of the raw request body, keyed with that shared secret
//
// No timestamp, no nonce, no URL or headers in the signed content, so there is
// no replay window to check: dedupe on eventId instead.
//
// During key renewal Worldpay sends TWO comma-separated signatures, in no fixed
// order ("always use the keyId"). Accept the request if ANY entry verifies with
// the secret held for its keyId.
//
// Signing is opt-in: ask your Worldpay Implementation Manager to enable the
// Event-Signature header. This handler rejects unsigned requests with 400.
//
// WPG (Corporate Gateway) XML order notifications are a different family:
// unsigned text/xml that must be answered with HTTP 200 and the literal body
// "[OK]". They don't belong on this route. Behind Hookdeck, the WORLDPAY source
// answers "[OK]" for you.
// ---------------------------------------------------------------------------

const SECRET_ENV_PREFIX = 'WORLDPAY_WEBHOOK_SECRET_';

/**
 * keyId -> shared secret, read from WORLDPAY_WEBHOOK_SECRET_<keyId> env vars on
 * every request (a missing secret fails closed per request instead of crashing
 * at import). Hold one secret normally and two during key renewal.
 * @returns {Map<string, string>}
 */
function loadSecrets() {
  const secrets = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(SECRET_ENV_PREFIX) || !value) continue;
    const keyId = name.slice(SECRET_ENV_PREFIX.length);
    if (/^[0-9]+$/.test(keyId)) secrets.set(keyId, value);
  }
  return secrets;
}

/**
 * Split Event-Signature into {keyId, hashFunction, signature} entries.
 * Malformed entries are skipped, never thrown on.
 * @param {string} header
 */
function parseEventSignature(header) {
  if (typeof header !== 'string') return [];
  const entries = [];
  for (const raw of header.split(',')) {
    const parts = raw.trim().split('/').map((p) => p.trim());
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) continue;
    const [keyId, hashFunction, signature] = parts;
    entries.push({ keyId, hashFunction, signature });
  }
  return entries;
}

// Event-Signature hashFunction -> Node digest name. Anything else is skipped
// rather than mapped to a guess.
const HASH_FUNCTIONS = { SHA256: 'sha256' };

/**
 * Verify the Event-Signature header against the exact bytes Worldpay sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} header - the Event-Signature header value
 * @param {Map<string, string>} secrets - keyId -> shared secret
 * @returns {boolean}
 */
function verifyWorldpaySignature(rawBody, header, secrets) {
  // The header is attacker-controlled and may repeat entries: compute each
  // (keyId, hashFunction) digest once and reuse it.
  const digests = new Map();
  for (const { keyId, hashFunction, signature } of parseEventSignature(header)) {
    const algorithm = HASH_FUNCTIONS[hashFunction.toUpperCase()];
    const secret = secrets.get(keyId);
    if (!algorithm || !secret) continue;
    const memoKey = `${keyId}/${algorithm}`;
    if (!digests.has(memoKey)) {
      digests.set(memoKey, crypto.createHmac(algorithm, secret).update(rawBody).digest('hex'));
    }
    // Hex: compare lower-case on both sides, the docs never promise a case.
    const expected = Buffer.from(digests.get(memoKey), 'utf8');
    const received = Buffer.from(signature.toLowerCase(), 'utf8');
    // timingSafeEqual throws on a length mismatch: check first.
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
      return true;
    }
  }
  return false;
}

// Event types from the Access Worldpay events OpenAPI spec, grouped by
// eventDetails.classification. Which ones you receive depends on your business
// line, payment methods and what your Implementation Manager enabled.
const WORLDPAY_EVENTS = {
  payment: [
    'sentForAuthorization', 'authorized', 'sentForSettlement', 'settled', 'settlementFailed',
    'settlementInstructed', 'settlementRejected', 'cancelled', 'cancelledByCustomer', 'error',
    'expired', 'requestExpired', 'refused', 'sentForRefund', 'refunded', 'refundFailed',
    'chargedBack', 'tokenCreated', 'topUpAccepted', 'topUpRejected',
  ],
  payout: ['requested', 'pending', 'approved', 'refused', 'disbursed'],
  chargeback: ['informationRequested'],
};

// `type` alone is NOT unique: `refused` is both a payment and a payout event.
// Route on the (classification, type) pair.
const eventKey = (classification, type) => `${classification}:${type}`;

const KNOWN_EVENTS = new Set(
  Object.entries(WORLDPAY_EVENTS).flatMap(([classification, types]) =>
    types.map((type) => eventKey(classification, type)),
  ),
);

// Demo-only dedupe store. Use a database unique constraint on eventId in production.
const seenEventIds = new Set();

/**
 * Runs AFTER the 200 has been sent. Worldpay waits 10 seconds for the 200, and
 * an unacknowledged event delays (or loses) the events queued behind it.
 */
async function processEvent(event) {
  const details = event.eventDetails || {};
  const summary = {
    eventId: event.eventId,
    // eventTimestamp has no timezone designator in the spec example: parse leniently.
    eventTimestamp: event.eventTimestamp,
    classification: details.classification,
    type: details.type,
    transactionReference: details.transactionReference,
    // Not present on every event (the payout schemas omit it).
    downstreamReference: details.downstreamReference,
    // Minor units: { value: 250, currencyCode: 'GBP' } is GBP 2.50.
    amount: details.amount?.value,
    currency: details.amount?.currencyCode,
  };

  let action;
  switch (eventKey(details.classification, details.type)) {
    case 'payment:authorized':
      action = 'payment authorized: funds reserved';
      break;
    case 'payment:sentForSettlement':
    case 'payment:settled':
      action = 'payment settling: fulfil the order';
      break;
    case 'payment:refused':
    case 'payment:error':
    case 'payment:expired':
    case 'payment:cancelled':
    case 'payment:cancelledByCustomer':
    case 'payment:requestExpired':
      // `error` is also used for payout-related failures.
      action = 'payment did not complete';
      break;
    case 'payment:sentForRefund':
      // Basic disbursement payouts also arrive as payment:sentForRefund.
      action = 'refund (or basic disbursement payout) requested';
      break;
    case 'payment:refunded':
    case 'payment:refundFailed':
      action = 'refund outcome';
      break;
    case 'payment:chargedBack':
    case 'chargeback:informationRequested':
      action = 'dispute: gather evidence';
      break;
    case 'payment:tokenCreated':
      // eventDetails shape varies by payment method (Card, Klarna, iDEAL, SEPA).
      action = 'token created';
      break;
    case 'payout:refused':
      action = 'payout refused';
      break;
    case 'payout:approved':
    case 'payout:disbursed':
      action = 'payout progressing';
      break;
    default:
      action = 'worldpay event received';
  }
  console.log(`Worldpay ${action}`, summary);
  return { ...summary, action };
}

// Swappable so tests (or a real queue) can take over.
let enqueue = (event) => {
  setImmediate(() => {
    processEvent(event).catch((err) => console.error('Worldpay event processing failed:', err.message));
  });
};

const WEBHOOK_PATH = '/webhooks/worldpay';

// express.raw({ type: '*/*' }) does two things: it keeps the exact bytes for the
// HMAC, and it accepts Worldpay's Content-Type,
// application/vnd.worldpay.events-v1.hal+json, which express.json() ignores
// (leaving you with an empty body).
app.post(WEBHOOK_PATH, express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const secrets = loadSecrets();
  if (secrets.size === 0) {
    // Fail closed: never skip verification because the secret is missing.
    console.error('No WORLDPAY_WEBHOOK_SECRET_<keyId> set: rejecting webhook');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Worldpay's documented contract: no signature (when set up for HMAC) -> 400,
  // signature mismatch -> discard the body and return 400. Not 401/403.
  const header = req.get('Event-Signature');
  if (!header) {
    return res.status(400).json({ error: 'Missing Event-Signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyWorldpaySignature(rawBody, header, secrets)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const details = event?.eventDetails;
  if (typeof event?.eventId !== 'string' || !details || typeof details !== 'object') {
    return res.status(400).json({ error: 'Not an Access Worldpay event' });
  }

  // Worldpay retries until it gets a 200 (for up to a week): duplicates are normal.
  if (seenEventIds.has(event.eventId)) {
    return res.status(200).json({ received: true, eventId: event.eventId, duplicate: true });
  }
  seenEventIds.add(event.eventId);

  const { classification, type } = details;
  if (!KNOWN_EVENTS.has(eventKey(classification, type))) {
    console.log(`Ignoring unknown Worldpay event ${classification}:${type}`);
    return res.status(200).json({ received: true, eventId: event.eventId, ignored: 'unknown event' });
  }

  // Acknowledge first, process afterwards.
  res.status(200).json({ received: true, eventId: event.eventId, classification, type });
  enqueue(event);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Worldpay webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}

module.exports = {
  app,
  loadSecrets,
  parseEventSignature,
  verifyWorldpaySignature,
  processEvent,
  eventKey,
  WORLDPAY_EVENTS,
  KNOWN_EVENTS,
  seenEventIds,
  setEnqueue: (fn) => {
    enqueue = fn;
  },
};
