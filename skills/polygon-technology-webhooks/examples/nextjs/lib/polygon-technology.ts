// Generated with: polygon-technology-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Polygon Technology OMS (stablecoin payments) signs every delivery with:
//
//   Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
//
// v1 is the lowercase hex HMAC-SHA256 of "<t>.<raw request body>", keyed with
// the signingKey from POST /webhooks, used as-is (no prefix, no decoding).
// This is NOT Standard Webhooks: there is no webhook-id or webhook-timestamp.
// Reject when |now - t| > 300 seconds, in either direction.

const TOLERANCE_SECONDS = 300;

/** Parse "t=...,v1=..." into a Map, by key (never by position). */
export function parseSignatureHeader(header: string | null | undefined): Map<string, string> {
  const parts = new Map<string, string>();
  for (const part of String(header ?? '').split(',')) {
    const i = part.indexOf('=');
    if (i > 0) parts.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return parts;
}

/** Verify Webhook-Signature against the exact bytes OMS sent. */
export function verifyOmsSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  signingKey: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
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

/** The six-field envelope. Fields that don't apply are left out, never null. */
export interface OmsEvent {
  id: string; // evt_ + 26 base32 chars. Don't parse it as a UUID.
  idempotencyKey: string;
  type: string;
  createdAt: string; // UTC, exactly 3 fractional digits
  schema: string; // "v1"; "" marks a pre-v1 event
  data: {
    resource: { id: string; status?: string; subStatus?: string; [key: string]: unknown };
    previousStatus?: string; // *.statusChanged only
    changedFields?: string[]; // *.updated only
  };
}

export type ProcessResult = 'processed' | 'duplicate' | 'stale' | 'ignored';

// In-memory stores for the demo. Use a database with unique constraints in production.
const seenEventIds = new Set<string>();
const seenIdempotencyKeys = new Set<string>();
const lastAppliedAt = new Map<string, string>(); // resource id -> createdAt

export function resetStore() {
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
export function effectiveSubStatus(subStatus: string | undefined): string {
  if (subStatus && KNOWN_SUB_STATUSES.has(subStatus)) return subStatus;
  return String(subStatus ?? '').split('.')[0];
}

/** Route on type, then read data.resource. */
function handleEvent(event: OmsEvent): ProcessResult {
  const { resource, previousStatus, changedFields } = event.data ?? ({} as OmsEvent['data']);

  switch (event.type) {
    case 'transaction.created':
      console.log(`Transaction ${resource.id} created: ${effectiveSubStatus(resource.subStatus)}`);
      break;
    case 'transaction.statusChanged':
      // A subStatus-only change also sends statusChanged, with previousStatus === status.
      if (previousStatus === resource.status) {
        console.log(`Transaction ${resource.id} sub-status now ${effectiveSubStatus(resource.subStatus)}`);
      } else {
        console.log(`Transaction ${resource.id}: ${previousStatus} -> ${effectiveSubStatus(resource.subStatus)}`);
      }
      break;
    case 'transfer.created':
      // May arrive before its transaction.created: hold it, or GET /transactions/{transactionId}.
      console.log(`Transfer ${resource.id} created`);
      break;
    case 'transfer.statusChanged':
      console.log(`Transfer ${resource.id}: ${previousStatus} -> ${resource.status}`);
      break;
    case 'transfer.updated':
      // Late details such as a transaction hash in tracking.
      console.log(`Transfer ${resource.id} updated: ${(changedFields ?? []).join(', ')}`);
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

/**
 * Delivery is at-least-once, parallel and unordered: dedupe on id AND
 * idempotencyKey, and apply only events newer than the last one applied for
 * the resource. createdAt compares correctly as text.
 */
export function processEvent(event: OmsEvent): ProcessResult {
  if (event.schema !== 'v1') return 'ignored';
  if (seenEventIds.has(event.id) || seenIdempotencyKeys.has(event.idempotencyKey)) return 'duplicate';
  seenEventIds.add(event.id);
  if (event.idempotencyKey) seenIdempotencyKeys.add(event.idempotencyKey);

  const resourceId = event.data?.resource?.id;
  if (resourceId) {
    const last = lastAppliedAt.get(resourceId);
    if (last !== undefined && event.createdAt <= last) return 'stale';
    lastAppliedAt.set(resourceId, event.createdAt);
  }
  return handleEvent(event);
}
