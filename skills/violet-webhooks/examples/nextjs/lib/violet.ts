// Generated with: violet-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// X-Violet-Hmac is the standard (padded) base64 of a 32-byte digest: 43 characters plus "="
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a Violet webhook signature.
 *
 * Violet sends `X-Violet-Hmac: <base64>`, the base64 HMAC-SHA256 of the raw request body bytes,
 * keyed with the app secret used as UTF-8 (not hex- or base64-decoded). Nothing else is signed.
 */
export function verifyVioletSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  // Validate the format first: Buffer.from(x, 'base64') silently drops bad characters
  if (typeof signatureHeader !== 'string' || !SIGNATURE_FORMAT.test(signatureHeader)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('base64'));
  const received = Buffer.from(signatureHeader);
  // Compare the base64 strings exactly (as Hookdeck does): a value whose last character carries
  // stray low bits decodes to the same digest but is not the string Violet sends
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Every field of the body is untrusted: read through type checks, never assume a shape
function summarize(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' || typeof body.id === 'number' ? body.id : 'unknown';
  const status = typeof body.status === 'string' ? body.status : undefined;
  return { id, status };
}

const ORDER_TOPICS = new Set([
  'ORDER_ACCEPTED',
  'ORDER_UPDATED',
  'ORDER_COMPLETED',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'ORDER_REFUNDED',
  'ORDER_CANCELLED',
  'ORDER_FAILED',
]);
const MERCHANT_TOPICS = new Set([
  'MERCHANT_CONNECTED',
  'MERCHANT_DISCONNECTED',
  'MERCHANT_ENABLED',
  'MERCHANT_DISABLED',
  'MERCHANT_NEEDS_ATTENTION',
  'MERCHANT_COMPLETE',
]);
const TRANSFER_TOPICS = new Set([
  'TRANSFER_SENT',
  'TRANSFER_PARTIALLY_SENT',
  'TRANSFER_FAILED',
  'TRANSFER_UPDATED',
  'TRANSFER_REVERSED',
  'TRANSFER_PARTIALLY_REVERSED',
  'TRANSFER_REVERSAL_FAILED',
]);

// Violet sends the entity itself as the body and names the event only in X-Violet-Topic
export function handleEvent(topic: string, body: Record<string, unknown>): void {
  const { id, status } = summarize(body);
  const suffix = status ? ` (${status})` : '';
  if (ORDER_TOPICS.has(topic)) {
    console.log(`${topic}: order ${id}${suffix}`);
  } else if (MERCHANT_TOPICS.has(topic)) {
    const name = typeof body.name === 'string' ? body.name : 'unknown';
    console.log(`${topic}: merchant ${id} "${name}"${suffix}`);
  } else if (TRANSFER_TOPICS.has(topic)) {
    const amount = typeof body.amount === 'number' ? body.amount : 'unknown';
    const currency = typeof body.currency === 'string' ? body.currency : '';
    console.log(`${topic}: transfer ${id} ${amount} ${currency}`.trim() + suffix);
  } else {
    // 52 documented events: handle the ones you need and log the rest
    console.log(`Unhandled Violet topic: ${topic}`);
  }
}
