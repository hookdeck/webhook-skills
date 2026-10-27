// Generated with: hyperswitch-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// HMAC-SHA512 hex digest = exactly 128 hex characters.
const SIGNATURE_PATTERN = /^[0-9a-fA-F]{128}$/;

/**
 * Verify the X-Webhook-Signature-512 header.
 *
 * Algorithm: HMAC-SHA512, hex digest, no prefix
 * Key:       the business profile's payment_response_hash_key, as UTF-8 bytes
 * Signed:    the raw request body bytes only (no timestamp, id or other header)
 */
export function verifyHyperswitchSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): { valid: boolean; error?: string } {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Webhook-Signature-512 header' };
  }
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops
  // bad characters. The whole header value is one digest (no list, no prefix).
  if (!SIGNATURE_PATTERN.test(signatureHeader)) {
    return { valid: false, error: 'Malformed signature' };
  }

  const expected = crypto
    .createHmac('sha512', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');

  // timingSafeEqual throws on unequal lengths, so check first.
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

// The 33 event_type wire values listed in Hyperswitch's webhook guide.
export const KNOWN_EVENT_TYPES = new Set([
  'payment_succeeded', 'payment_failed', 'payment_processing', 'payment_cancelled',
  'payment_cancelled_post_capture', 'payment_authorized', 'payment_partially_authorized',
  'payment_captured', 'payment_expired', 'action_required',
  'refund_succeeded', 'refund_failed', 'refund_review',
  'dispute_opened', 'dispute_expired', 'dispute_accepted', 'dispute_cancelled',
  'dispute_challenged', 'dispute_won', 'dispute_lost',
  'mandate_active', 'mandate_revoked',
  'payout_success', 'payout_failed', 'payout_initiated', 'payout_processing',
  'payout_cancelled', 'payout_expired', 'payout_reversed', 'payout_not_permitted',
  'invoice_paid', 'surcharge_payment_succeeded', 'surcharge_refund_succeeded',
]);

export interface HyperswitchEvent {
  merchant_id?: string;
  event_id?: string;
  event_type?: string;
  content?: { type?: string; object?: Record<string, unknown> };
  timestamp?: string;
}

// In-memory dedupe on event_id. Use a shared store (Redis, database) in production.
export const processedEventIds = new Set<string>();

/**
 * Dispatch on the top-level `event_type`. `content.type` only names the
 * resource shape (payment_details, refund_details, ...) held in `content.object`.
 */
export function handleHyperswitchEvent(event: HyperswitchEvent): void {
  const object = event.content?.object ?? {};

  switch (event.event_type) {
    case 'payment_succeeded':
      console.log('Payment succeeded:', object.payment_id);
      break;
    case 'payment_failed':
      console.log('Payment failed:', object.payment_id, object.error_message);
      break;
    case 'action_required':
      console.log('Payment needs customer action:', object.payment_id);
      break;
    case 'refund_succeeded':
      console.log('Refund succeeded:', object.refund_id);
      break;
    case 'refund_failed':
      console.log('Refund failed:', object.refund_id);
      break;
    case 'dispute_opened':
      console.log('Dispute opened:', object.dispute_id);
      break;
    default:
      if (event.event_type && KNOWN_EVENT_TYPES.has(event.event_type)) {
        console.log(`Received ${event.event_type} (no specific handler)`);
      } else {
        // Hyperswitch may add events: log and acknowledge.
        console.log(`Unhandled Hyperswitch event_type: ${event.event_type}`);
      }
  }
}
