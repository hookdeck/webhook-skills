// Generated with: polygon-technology-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Polygon Technology OMS (stablecoin payments) signs every delivery with:
//
//   Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
//
// v1 is the lowercase hex HMAC-SHA256 of "<t>.<raw request body>", keyed with
// the signingKey from POST /webhooks, used as-is (no prefix, no decoding).
// This is NOT Standard Webhooks: there is no webhook-id or webhook-timestamp.
// Reject when |now - t| > 300 seconds, in either direction.
// ---------------------------------------------------------------------------

const TOLERANCE_SECONDS = 300;

/** Parse "t=...,v1=..." into a Map, by key (never by position). */
function parseSignatureHeader(header) {
  const parts = new Map();
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i > 0) parts.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return parts;
}

/**
 * Verify Webhook-Signature against the exact bytes OMS sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} header - Webhook-Signature
 * @param {string} signingKey - OMS_WEBHOOK_SIGNING_KEY
 * @param {number} [nowSeconds]
 * @returns {boolean}
 */
function verifyOmsSignature(rawBody, header, signingKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!signingKey || !header) return false;
  const parts = parseSignatureHeader(header);
  const timestamp = parts.get('t');
  const signature = parts.get('v1');
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  if (!signature || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  // Stale and future-dated timestamps are rejected the same way.
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, 'hex');
  // timingSafeEqual throws on a length mismatch: check length first.
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// ---------------------------------------------------------------------------
// Event handling. Delivery is at-least-once, parallel and unordered, so:
//   - dedupe on BOTH id (same on every retry) and idempotencyKey (same change
//     emitted twice with different ids);
//   - apply an event only if its createdAt is newer than the last one applied
//     for that resource (createdAt is UTC with 3 fractional digits, so the ISO
//     strings compare correctly as text).
// These in-memory stores are for the demo. Use a database with unique
// constraints in production.
// ---------------------------------------------------------------------------

const seenEventIds = new Set();
const seenIdempotencyKeys = new Set();
const lastAppliedAt = new Map(); // resource id -> createdAt

function resetStore() {
  seenEventIds.clear();
  seenIdempotencyKeys.clear();
  lastAppliedAt.clear();
}

// Sub-statuses this handler branches on. The list is open: OMS can add new
// ones without a version bump, so anything else falls back to the prefix.
const KNOWN_SUB_STATUSES = new Set([
  'processing.underReview',
  'awaitingAction.awaitingSenderAttribution',
  'awaitingAction.payoutDestinationMissing',
  'completed.settled',
]);

/** "processing.somethingNew" -> "processing" (fallback for unknown sub-statuses). */
function baseStatus(subStatus) {
  return String(subStatus || '').split('.')[0];
}

function effectiveSubStatus(subStatus) {
  return KNOWN_SUB_STATUSES.has(subStatus) ? subStatus : baseStatus(subStatus);
}

/** Route on type, then read data.resource. Fields that don't apply are left out, not null. */
function handleEvent(event) {
  const data = event.data || {};
  const resource = data.resource || {};

  switch (event.type) {
    case 'transaction.created':
      console.log(`Transaction ${resource.id} created: ${effectiveSubStatus(resource.subStatus)}`);
      break;
    case 'transaction.statusChanged':
      // A subStatus-only change also sends statusChanged, with previousStatus === status.
      // Branch on status; subStatus adds detail (processing.underReview = held for review).
      if (data.previousStatus === resource.status) {
        console.log(`Transaction ${resource.id} sub-status now ${effectiveSubStatus(resource.subStatus)}`);
      } else {
        console.log(`Transaction ${resource.id}: ${data.previousStatus} -> ${effectiveSubStatus(resource.subStatus)}`);
      }
      break;
    case 'transfer.created':
      // May arrive before its transaction.created: hold it, or GET /transactions/{transactionId}.
      console.log(`Transfer ${resource.id} created (${resource.role}, ${resource.rail})`);
      break;
    case 'transfer.statusChanged':
      console.log(`Transfer ${resource.id}: ${data.previousStatus} -> ${resource.status}`);
      break;
    case 'transfer.updated':
      // Late details such as a transaction hash in tracking.
      console.log(`Transfer ${resource.id} updated: ${(data.changedFields || []).join(', ')}`);
      break;
    case 'customer.created':
    case 'customer.statusChanged':
    case 'customer.updated':
    case 'externalAccount.created':
    case 'externalAccount.statusChanged':
    case 'externalAccount.updated':
    case 'counterparty.created':
    case 'counterparty.statusChanged':
    case 'counterparty.updated':
    case 'customerWallet.created':
    case 'customerWallet.statusChanged':
    case 'customerWallet.updated':
    case 'depositAddress.created':
    case 'depositAddress.statusChanged':
    case 'depositAddress.updated':
    case 'virtualAccount.created':
    case 'virtualAccount.statusChanged':
    case 'virtualAccount.updated':
    case 'cashIn.created':
    case 'cashIn.statusChanged':
    case 'cashIn.updated':
      console.log(`${event.type} for ${resource.id}: status=${resource.status}`);
      break;
    default:
      // New types can appear without a version bump: acknowledge and ignore.
      console.log(`Ignoring unknown OMS event type ${event.type}`);
      return 'ignored';
  }
  return 'processed';
}

/** Dedupe, order, then handle. Returns what happened to the event. */
function processEvent(event) {
  // schema "" marks an event written before the current format.
  if (event.schema !== 'v1') return 'ignored';
  if (seenEventIds.has(event.id) || seenIdempotencyKeys.has(event.idempotencyKey)) return 'duplicate';
  seenEventIds.add(event.id);
  if (event.idempotencyKey) seenIdempotencyKeys.add(event.idempotencyKey);

  const resourceId = event.data && event.data.resource && event.data.resource.id;
  if (resourceId) {
    const last = lastAppliedAt.get(resourceId);
    if (last !== undefined && event.createdAt <= last) return 'stale';
    lastAppliedAt.set(resourceId, event.createdAt);
  }
  return handleEvent(event);
}

// express.raw() keeps the exact bytes OMS signed: don't put express.json() in front.
app.post('/webhooks/polygon-technology', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
  const signingKey = process.env.OMS_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.error('OMS_WEBHOOK_SIGNING_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook signing key not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyOmsSignature(rawBody, req.get('webhook-signature'), signingKey)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Respond fast (timeoutMs defaults to 5000, max 10000). In production,
  // persist the event here, return 2xx, and do slow work asynchronously.
  const result = processEvent(event);
  return res.status(200).json({ received: true, id: event.id, type: event.type, result });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Polygon Technology OMS webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/polygon-technology`);
  });
}

module.exports = { app, verifyOmsSignature, parseSignatureHeader, processEvent, effectiveSubStatus, resetStore };
