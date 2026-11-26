// Generated with: worldpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Access Worldpay event webhooks: the Event-Signature header
//
//   Event-Signature: {keyId}/{hashFunction}/{signature}[,{keyId}/{hashFunction}/{signature}...]
//
//   keyId        numeric reference to the shared secret that signed the message
//   hashFunction SHA256 (the only value Worldpay supports today)
//   signature    hex HMAC of the raw request body, keyed with that shared secret
//
// No timestamp in the signed content or the header, so there is no replay
// window: dedupe on eventId. During key renewal Worldpay sends TWO signatures in
// no fixed order ("always use the keyId"); accept if ANY entry verifies with the
// secret held for its keyId.
import crypto from 'crypto';

export interface WorldpayEvent {
  eventId: string;
  eventTimestamp?: string;
  eventDetails: {
    classification?: string;
    type?: string;
    transactionReference?: string;
    downstreamReference?: string;
    date?: string;
    amount?: { value?: number; currencyCode?: string };
    _links?: Record<string, unknown>;
    [field: string]: unknown;
  };
}

export interface SignatureEntry {
  keyId: string;
  hashFunction: string;
  signature: string;
}

const SECRET_ENV_PREFIX = 'WORLDPAY_WEBHOOK_SECRET_';

/**
 * keyId -> shared secret, read from WORLDPAY_WEBHOOK_SECRET_<keyId> env vars at
 * request time (a missing secret fails closed per request instead of breaking
 * the build). Hold one secret normally and two during key renewal.
 */
export function loadSecrets(): Map<string, string> {
  const secrets = new Map<string, string>();
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(SECRET_ENV_PREFIX) || !value) continue;
    const keyId = name.slice(SECRET_ENV_PREFIX.length);
    if (/^[0-9]+$/.test(keyId)) secrets.set(keyId, value);
  }
  return secrets;
}

/** Split Event-Signature into entries. Malformed entries are skipped, never thrown on. */
export function parseEventSignature(header: string | null | undefined): SignatureEntry[] {
  if (typeof header !== 'string') return [];
  const entries: SignatureEntry[] = [];
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
const HASH_FUNCTIONS: Record<string, string> = { SHA256: 'sha256' };

/** Verify Event-Signature against the exact bytes Worldpay sent. */
export function verifyWorldpaySignature(
  rawBody: Buffer | string,
  header: string | null | undefined,
  secrets: Map<string, string>,
): boolean {
  // The header is attacker-controlled and may repeat entries: compute each
  // (keyId, hashFunction) digest once and reuse it.
  const digests = new Map<string, string>();
  for (const { keyId, hashFunction, signature } of parseEventSignature(header)) {
    const algorithm = HASH_FUNCTIONS[hashFunction.toUpperCase()];
    const secret = secrets.get(keyId);
    if (!algorithm || !secret) continue;
    const memoKey = `${keyId}/${algorithm}`;
    let digest = digests.get(memoKey);
    if (digest === undefined) {
      digest = crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');
      digests.set(memoKey, digest);
    }
    // Hex: compare lower-case on both sides, the docs never promise a case.
    const expected = Buffer.from(digest, 'utf8');
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
export const WORLDPAY_EVENTS: Record<string, string[]> = {
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
export const eventKey = (classification: unknown, type: unknown) => `${classification}:${type}`;

export const KNOWN_EVENTS = new Set<string>(
  Object.entries(WORLDPAY_EVENTS).flatMap(([classification, types]) =>
    types.map((type) => eventKey(classification, type)),
  ),
);

// Demo-only dedupe store. Use a database unique constraint on eventId in production.
export const seenEventIds = new Set<string>();

/**
 * Runs AFTER the 200 has been sent. Worldpay waits 10 seconds for the 200, and
 * an unacknowledged event delays (or loses) the events queued behind it.
 */
export async function processEvent(event: WorldpayEvent) {
  const details = event.eventDetails ?? {};
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

  let action: string;
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
