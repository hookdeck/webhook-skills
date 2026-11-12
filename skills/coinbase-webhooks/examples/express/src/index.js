// Generated with: coinbase-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

// Coinbase Developer Platform (CDP) webhooks v2.
// The CDP SDK has no webhook-verification helper, so we verify manually.

// Reject deliveries whose `t` is older (or further in the future) than this.
// CDP's reference implementation defaults to 5 minutes. CDP retries up to 60 times
// with exponential backoff, so a stricter window rejects legitimate late retries:
// rely on idempotency instead of tightening it.
const MAX_AGE_SECONDS = 5 * 60;

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Parse `t=...,v0=...,h=...,v1=...`. Part order is not guaranteed, so parse by
 * key. `h` contains spaces (never commas), so split on commas, then on the
 * first `=` only.
 */
function parseSignatureHeader(header) {
  const parts = {};
  for (const segment of header.split(',')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    parts[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim();
  }
  return parts;
}

/**
 * Verify a CDP webhook signature.
 *
 * - v1 = hex HMAC-SHA256 over `{t}.{h}.{headerValues}.{rawBody}`, where
 *   headerValues are the values of the headers named in `h` (in order),
 *   joined with "." (a missing header contributes "").
 * - v0 = hex HMAC-SHA256 over `{t}.{rawBody}`.
 *
 * v1 is used when the header carries both `v1=` and `h=`; otherwise v0.
 * Pass `scheme: 'v0'` if a proxy in front of you rewrites any header named in `h`.
 *
 * @param {Buffer} rawBody  exact request bytes
 * @param {string} signatureHeader  X-Webhook-Signature (or X-Hook0-Signature) value
 * @param {(name: string) => string | undefined} getHeader  case-insensitive header lookup
 * @param {string} secret  the subscription secret (used as UTF-8 bytes, no decoding)
 */
function verifyCoinbaseSignature(rawBody, signatureHeader, getHeader, secret, options = {}) {
  const { maxAgeSeconds = MAX_AGE_SECONDS, now = Math.floor(Date.now() / 1000), scheme = 'auto' } = options;
  const parts = parseSignatureHeader(signatureHeader);

  // `t` is unix seconds. Validate before doing arithmetic with it.
  if (!parts.t || !/^\d+$/.test(parts.t) || Number(parts.t) <= 0) {
    return { valid: false, reason: 'Invalid timestamp' };
  }
  if (Math.abs(now - Number(parts.t)) > maxAgeSeconds) {
    return { valid: false, reason: 'Timestamp outside tolerance' };
  }

  let prefix;
  let provided;
  if (scheme !== 'v0' && parts.v1 && parts.h) {
    const headerValues = parts.h
      .split(' ')
      .filter(Boolean)
      .map((name) => getHeader(name.toLowerCase()) ?? '')
      .join('.');
    prefix = `${parts.t}.${parts.h}.${headerValues}.`;
    provided = parts.v1;
  } else if (parts.v0) {
    prefix = `${parts.t}.`;
    provided = parts.v0;
  } else {
    return { valid: false, reason: 'No usable signature' };
  }

  // timingSafeEqual throws on unequal lengths, so validate the hex first.
  if (!HEX_SHA256.test(provided)) {
    return { valid: false, reason: 'Malformed signature' };
  }

  const expected = crypto.createHmac('sha256', secret).update(prefix).update(rawBody).digest();
  const valid = crypto.timingSafeEqual(expected, Buffer.from(provided, 'hex'));
  return valid ? { valid: true } : { valid: false, reason: 'Signature mismatch' };
}

/** Return the first defined value among `keys` on `obj`. */
function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * `onchain.activity.detected` has two contradictory documented bodies:
 * enveloped camelCase (`{ id, type, createdAt, data: {...} }`, on the
 * verify-signatures page) and flat snake_case (onchain-activity overview and
 * v2-upgrade pages). Accept both.
 */
function normalizeOnchainActivity(body) {
  const d = body && typeof body.data === 'object' && body.data !== null ? body.data : body;
  return {
    network: pick(d, 'network', 'networkId'),
    contractAddress: pick(d, 'contract_address', 'contractAddress'),
    eventName: pick(d, 'event_name', 'eventName'),
    transactionHash: pick(d, 'transaction_hash', 'transactionHash'),
    logIndex: pick(d, 'log_index', 'logIndex'),
    blockNumber: pick(d, 'block_number', 'blockNumber'),
    parameters: pick(d, 'parameters') ?? { from: d?.from, to: d?.to, value: d?.value },
  };
}

// Demo-only idempotency store. Use a database unique constraint or Redis SETNX in production.
const processedEvents = new Set();

function dedupeKey(eventType, body, eventIdHeader) {
  if (eventIdHeader) return `id:${eventIdHeader}`;
  if (body.eventID) return `id:${body.eventID}`; // transfers (capital D)
  if (body.eventId) return `id:${body.eventId}`; // payment acceptance (lowercase d)
  if (body.id) return `id:${body.id}`;
  if (eventType && eventType.endsWith('.activity.detected')) {
    const a = normalizeOnchainActivity(body);
    if (a.transactionHash !== undefined && a.logIndex !== undefined) {
      return `log:${a.transactionHash}:${a.logIndex}`;
    }
  }
  return null;
}

function handleEvent(eventType, body) {
  switch (eventType) {
    // Wallet transaction lifecycle. Solana uses transaction_signature, not transaction_hash.
    case 'wallet.transaction.created':
    case 'wallet.transaction.signed':
    case 'wallet.transaction.broadcast':
    case 'wallet.transaction.replaced':
    case 'wallet.transaction.confirmed':
    case 'wallet.transaction.failed': {
      const tx = pick(body, 'transaction_hash', 'transaction_signature');
      console.log(`${eventType}: ${tx} (${body.address} on ${body.network})`);
      break;
    }
    case 'wallet.transaction.pending':
      // EVM only: >30s in the mempool. Not a failure; decide whether to replace with higher gas.
      console.log(`Pending since ${body.pending_since}: ${body.transaction_hash}`,
        { maxFeePerGas: body.max_fee_per_gas, maxPriorityFeePerGas: body.max_priority_fee_per_gas });
      break;
    case 'wallet.typed_data.signed':
    case 'wallet.message.signed':
    case 'wallet.hash.signed':
      console.log(`${eventType} by ${body.address}`);
      break;
    case 'wallet.delegation.created':
    case 'wallet.delegation.revoked':
      console.log(`${eventType}: delegation ${body.delegation_id} for user ${body.user_id}`);
      break;

    // Onchain activity: one event type for every contract event (filtered by subscription labels).
    case 'onchain.activity.detected':
    case 'wallet.activity.detected': {
      const a = normalizeOnchainActivity(body);
      console.log(`${eventType}: ${a.eventName} on ${a.contractAddress} (${a.network}) tx ${a.transactionHash}#${a.logIndex}`);
      break;
    }
    case 'wallet.activity.multi': {
      const d = body.data ?? body;
      // `value` is the RAW token amount: for 6-decimal USDC, "5000000" is $5.00.
      console.log(`ERC-20 transfer ${d.direction} ${d.matchedAddress}: raw value ${d.value} (tx ${d.transactionHash})`);
      break;
    }

    // Transfers: completed/failed are always sent; quoted/processing are best-effort and may be skipped.
    // expired is documented on the example-payloads page.
    case 'payments.transfers.quoted':
    case 'payments.transfers.processing':
      console.log(`Transfer ${body.data?.transferId} is ${body.data?.status}`);
      break;
    case 'payments.transfers.completed':
      console.log(`Transfer ${body.data?.transferId} completed: ${body.data?.targetAmount} ${body.data?.targetAsset}`);
      break;
    case 'payments.transfers.failed':
      console.log(`Transfer ${body.data?.transferId} failed`);
      break;
    case 'payments.transfers.expired':
      // The quote expired before execution. data.status stays "quoted", so key off the event type.
      console.log(`Transfer ${body.data?.transferId} quote expired at ${body.data?.expiresAt}`);
      break;

    // Onramp / Offramp: flat camelCase body; money fields may be strings or {currency, value} objects.
    case 'onramp.transaction.created':
    case 'onramp.transaction.updated':
    case 'onramp.transaction.success':
    case 'onramp.transaction.failed':
    case 'offramp.transaction.created':
    case 'offramp.transaction.updated':
    case 'offramp.transaction.success':
    case 'offramp.transaction.failed':
      console.log(`${eventType}: ${pick(body, 'transactionId', 'orderId')} status ${body.status}`);
      break;

    default:
      console.log(`Unhandled Coinbase CDP event type: ${eventType}`);
  }
}

// Raw body is mandatory: the signature covers the exact bytes sent.
app.post('/webhooks/coinbase', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.COINBASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('COINBASE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Server configuration error');
  }

  // X-Hook0-Signature is a deprecated alias carrying the identical value.
  const signatureHeader = req.get('x-webhook-signature') || req.get('x-hook0-signature');
  if (!signatureHeader) {
    return res.status(400).send('Missing signature header');
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).send('Expected application/json body');
  }

  const result = verifyCoinbaseSignature(req.body, signatureHeader, (name) => req.get(name), secret);
  if (!result.valid) {
    console.error(`Coinbase webhook verification failed: ${result.reason}`);
    return res.status(400).send('Invalid signature');
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Route on the X-Event-Type header; fall back to the body (`type`, then `eventType`).
  const eventType = req.get('x-event-type') || body.type || body.eventType;

  // Delivery is at-least-once: duplicates are expected.
  const key = dedupeKey(eventType, body, req.get('x-event-id'));
  if (key && processedEvents.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  handleEvent(eventType, body);
  if (key) processedEvents.add(key);

  // Acknowledge fast. In production, enqueue the event and process it asynchronously.
  res.status(200).json({ received: true, type: eventType });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyCoinbaseSignature, parseSignatureHeader, normalizeOnchainActivity, processedEvents, MAX_AGE_SECONDS };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/coinbase`);
  });
}
