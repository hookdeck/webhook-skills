import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

// LearnHouse sends X-Webhook-Signature: sha256=<hex>, the HMAC-SHA256 of the raw
// body bytes keyed with the whole whsec_... secret (plain UTF-8 key, NOT Standard Webhooks).
export function verifyLearnhouseSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!header || !secret) return false;
  const value = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;
  // Validate length and alphabet before decoding: Buffer.from(x, 'hex') drops bad characters
  if (!HEX_SHA256.test(value)) return false;
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Deliveries are at-least-once. Use a database or cache in production.
const seenDeliveries = new Set<string>();

export function isDuplicateDelivery(id: string | undefined): boolean {
  if (!id) return false;
  if (seenDeliveries.has(id)) return true;
  seenDeliveries.add(id);
  return false;
}
