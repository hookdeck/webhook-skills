// Generated with: worldline-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Worldline Connect and Worldline Direct share one webhook signing scheme:
//   X-GCS-Signature = base64( HMAC-SHA256(webhooks secret key, raw body bytes) )
//   X-GCS-KeyId     = id of the webhooks key that signed the message
// No timestamp, no nonce, nothing else in the signing input. The key is the
// dedicated webhooks secret key, NOT the REST API key.
import crypto from 'crypto';

export interface WorldlineWebhookEvent {
  apiVersion: string;
  id: string;
  created?: string;
  merchantId?: string;
  type: string;
  [resource: string]: unknown;
}

/**
 * Key id -> secret lookup, seeded from env at request time (a missing env var
 * fails closed per request instead of crashing the build). Connect signs with
 * the OLDEST key on the account, so during a rotation both must resolve.
 */
export function loadSecretKeyStore(): Map<string, string> {
  const store = new Map<string, string>();
  const pairs: Array<[string | undefined, string | undefined]> = [
    [process.env.WORLDLINE_WEBHOOK_KEY_ID, process.env.WORLDLINE_WEBHOOK_SECRET],
    [process.env.WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS, process.env.WORLDLINE_WEBHOOK_SECRET_PREVIOUS],
  ];
  for (const [keyId, secret] of pairs) {
    if (keyId && secret) store.set(keyId, secret);
  }
  return store;
}

/** Verify X-GCS-Signature (standard padded base64) against the exact bytes Worldline sent. */
export function verifyWorldlineSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch: check first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Optional defence-in-depth: the custom "webhooks header" (Connect). Never a replacement for the HMAC. */
export function customHeaderMatches(headers: Headers): boolean {
  const name = process.env.WORLDLINE_CUSTOM_HEADER_NAME;
  const value = process.env.WORLDLINE_CUSTOM_HEADER_VALUE;
  if (!name || !value) return true; // layer not configured; the HMAC check still ran
  const a = Buffer.from(headers.get(name) ?? '', 'utf8');
  const b = Buffer.from(value, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Documented event types. Unknown types are acknowledged (2xx), never rejected.
export const CONNECT_EVENTS = new Set<string>([
  'payment.created', 'payment.redirected', 'payment.pending_payment', 'payment.account_verified',
  'payment.pending_fraud_approval', 'payment.authorization_requested', 'payment.pending_approval',
  'payment.pending_completion', 'payment.pending_capture', 'payment.capture_requested',
  'payment.captured', 'payment.paid', 'payment.paid_increment', 'payment.completed',
  'payment.capture_in_progress', 'payment.reversed', 'payment.chargeback_notification',
  'payment.chargebacked', 'payment.rejected', 'payment.rejected_capture', 'payment.cancelled',
  'payment.refunded',
  'refund.created', 'refund.pending_approval', 'refund.rejected', 'refund.refund_requested',
  'refund.captured', 'refund.refunded', 'refund.cancelled',
  'payout.created', 'payout.pending_approval', 'payout.rejected', 'payout.payout_requested',
  'payout.account_credited', 'payout.rejected_credit', 'payout.cancelled', 'payout.reversed',
  'token.created', 'token.updated', 'token.expired', 'token.expiring_soon', 'token.deleted',
  'dispute.draft', 'dispute.created', 'dispute.invalid_representment', 'dispute.send_to_bank',
  'dispute.success', 'dispute.expired', 'dispute.cancelled',
  'capture.created', 'capture.rejected', 'capture.cancelled', 'capture.captured', 'capture.paid',
  'capture.chargebacked', 'capture.chargeback_notification', 'capture.requested',
]);

export const DIRECT_EVENTS = new Set<string>([
  'payment.created', 'payment.redirected', 'payment.authorization_requested',
  'payment.pending_approval', 'payment.pending_completion', 'payment.pending_capture',
  'payment.capture_requested', 'payment.captured', 'payment.rejected', 'payment.rejected_capture',
  'payment.cancelled', 'payment.refunded', 'refund.refund_requested',
  'paymentlink.created', 'paymentlink.clicked', 'paymentlink.paid', 'paymentlink.cancelled',
  'paymentlink.expired', 'paymentlink.payment.rejected', 'paymentlink.payment.cancelled',
]);

// Object prefix of `type` -> body key holding the resource. Explicit because
// Direct's `paymentlink.*` events carry the object under `paymentLink`.
const RESOURCE_KEYS: Record<string, string> = {
  payment: 'payment',
  refund: 'refund',
  payout: 'payout',
  token: 'token',
  dispute: 'dispute',
  capture: 'capture',
  paymentlink: 'paymentLink',
};

/** Everything before the FIRST dot. `paymentlink.payment.rejected` -> `paymentlink`. */
export function resourceKeyFor(type: string): string | undefined {
  const dot = type.indexOf('.');
  return dot > 0 ? RESOURCE_KEYS[type.slice(0, dot)] : undefined;
}

// Demo-only dedupe store. Use a database unique constraint on the event id in production.
export const seenEventIds = new Set<string>();

type Resource = {
  id?: string;
  status?: string;
  paymentOutput?: Output;
  refundOutput?: Output;
};
type Output = {
  amountOfMoney?: { amount?: number; currencyCode?: string };
  references?: { merchantReference?: string };
};

/**
 * Runs AFTER the response (Connect times out at 10 seconds). Logs only
 * non-sensitive fields: payloads carry masked PANs, 3-D Secure data and fraud results.
 */
export async function processEvent(event: WorldlineWebhookEvent) {
  const key = resourceKeyFor(event.type);
  const resource = (key ? event[key] : undefined) as Resource | undefined;
  const output = resource?.paymentOutput ?? resource?.refundOutput ?? {};
  const summary = {
    eventId: event.id,
    type: event.type,
    merchantId: event.merchantId,
    resourceId: resource?.id,
    status: resource?.status,
    // Amounts are integer minor units: 1000 EUR = EUR 10.00.
    amount: output.amountOfMoney?.amount,
    currency: output.amountOfMoney?.currencyCode,
    // Direct changes payment.id on capture/refund: correlate on merchantReference too.
    merchantReference: output.references?.merchantReference,
  };

  // Arrival order is not event order. Compare against the resource's own status
  // (or re-read it via the REST API) instead of trusting the sequence.
  switch (event.type) {
    case 'payment.captured':
    case 'payment.paid':
    case 'payment.completed':
      console.log('Payment settled: fulfil the order', summary);
      break;
    case 'payment.rejected':
    case 'payment.cancelled':
      console.log('Payment did not complete', summary);
      break;
    case 'refund.refunded':
      console.log('Refund completed', summary);
      break;
    case 'token.deleted':
      // "The event's token payload will contain only an id."
      console.log('Token deleted', { eventId: event.id, tokenId: resource?.id });
      break;
    case 'dispute.created':
      console.log('Dispute opened', summary);
      break;
    case 'paymentlink.paid':
      console.log('Payment link paid', summary);
      break;
    default:
      console.log('Worldline event received', summary);
  }
  return summary;
}
