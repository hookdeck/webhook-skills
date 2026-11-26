// Generated with: coinbase-webhooks skill
// https://github.com/hookdeck/webhook-skills
// Coinbase Developer Platform (CDP) webhooks v2: verification and event helpers.
import crypto from 'crypto';

// CDP's reference implementation defaults to a 5-minute window. CDP retries up to
// 60 times with exponential backoff, so pair this with idempotency rather than tightening it.
export const MAX_AGE_SECONDS = 5 * 60;

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

export type VerifyResult = { valid: true } | { valid: false; reason: string };
export type Json = Record<string, any>;

/** Parse `t=...,v0=...,h=...,v1=...` by key: part order is not guaranteed. */
export function parseSignatureHeader(header: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const segment of header.split(',')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    parts[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim();
  }
  return parts;
}

/**
 * v1 = hex HMAC-SHA256 over `{t}.{h}.{headerValues}.{rawBody}` (headerValues: values of the
 * headers named in `h`, in order, joined with "."; missing header = "").
 * v0 = hex HMAC-SHA256 over `{t}.{rawBody}`.
 * v1 is used when both `v1=` and `h=` are present, otherwise v0. Pass `scheme: 'v0'` if a
 * proxy in front of you rewrites a header named in `h`.
 */
export function verifyCoinbaseSignature(
  rawBody: string,
  signatureHeader: string,
  getHeader: (name: string) => string | null | undefined,
  secret: string,
  options: { maxAgeSeconds?: number; now?: number; scheme?: 'auto' | 'v0' } = {},
): VerifyResult {
  const { maxAgeSeconds = MAX_AGE_SECONDS, now = Math.floor(Date.now() / 1000), scheme = 'auto' } = options;
  const parts = parseSignatureHeader(signatureHeader);

  if (!parts.t || !/^\d+$/.test(parts.t) || Number(parts.t) <= 0) {
    return { valid: false, reason: 'Invalid timestamp' };
  }
  if (Math.abs(now - Number(parts.t)) > maxAgeSeconds) {
    return { valid: false, reason: 'Timestamp outside tolerance' };
  }

  let signed: string;
  let provided: string;
  if (scheme !== 'v0' && parts.v1 && parts.h) {
    const headerValues = parts.h
      .split(' ')
      .filter(Boolean)
      .map((name) => getHeader(name.toLowerCase()) ?? '')
      .join('.');
    signed = `${parts.t}.${parts.h}.${headerValues}.${rawBody}`;
    provided = parts.v1;
  } else if (parts.v0) {
    signed = `${parts.t}.${rawBody}`;
    provided = parts.v0;
  } else {
    return { valid: false, reason: 'No usable signature' };
  }

  // timingSafeEqual throws on unequal lengths, so validate the hex first.
  if (!HEX_SHA256.test(provided)) return { valid: false, reason: 'Malformed signature' };

  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(provided, 'hex'))
    ? { valid: true }
    : { valid: false, reason: 'Signature mismatch' };
}

function pick(obj: Json | undefined, ...keys: string[]): any {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * `onchain.activity.detected` has two contradictory documented bodies (enveloped camelCase
 * and flat snake_case). Accept both.
 */
export function normalizeOnchainActivity(body: Json) {
  const d: Json = body && typeof body.data === 'object' && body.data !== null ? body.data : body;
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

// Demo-only idempotency store (per server instance). Use a database or Redis in production.
export const processedEvents = new Set<string>();

export function dedupeKey(eventType: string | undefined, body: Json, eventIdHeader: string | null): string | null {
  if (eventIdHeader) return `id:${eventIdHeader}`;
  if (body.eventID) return `id:${body.eventID}`; // transfers (capital D)
  if (body.eventId) return `id:${body.eventId}`; // payment acceptance (lowercase d)
  if (body.id) return `id:${body.id}`;
  if (eventType?.endsWith('.activity.detected')) {
    const a = normalizeOnchainActivity(body);
    if (a.transactionHash !== undefined && a.logIndex !== undefined) return `log:${a.transactionHash}:${a.logIndex}`;
  }
  return null;
}

export function handleEvent(eventType: string | undefined, body: Json) {
  switch (eventType) {
    // Wallet transaction lifecycle. Solana uses transaction_signature, not transaction_hash.
    case 'wallet.transaction.created':
    case 'wallet.transaction.signed':
    case 'wallet.transaction.broadcast':
    case 'wallet.transaction.replaced':
    case 'wallet.transaction.confirmed':
    case 'wallet.transaction.failed':
      console.log(`${eventType}: ${pick(body, 'transaction_hash', 'transaction_signature')} (${body.address} on ${body.network})`);
      break;
    case 'wallet.transaction.pending':
      // EVM only: >30s in the mempool. Not a failure; decide whether to replace with higher gas.
      console.log(`Pending since ${body.pending_since}: ${body.transaction_hash}`, {
        maxFeePerGas: body.max_fee_per_gas,
        maxPriorityFeePerGas: body.max_priority_fee_per_gas,
      });
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
