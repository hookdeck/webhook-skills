import crypto from 'crypto';

// x-payt-signature is the bare hex HMAC-SHA256 digest: exactly 64 hex characters, no prefix.
const SIGNATURE_FORMAT = /^[0-9a-fA-F]{64}$/;

/**
 * Verify the x-payt-signature header.
 * Signature = hex(HMAC-SHA256(secret, rawBody)): the raw body bytes only (no timestamp or id
 * is signed), key = the secret's UTF-8 bytes. The format is checked first, so Buffer.from()
 * never sees an unvalidated value; hex is case-insensitive, so both sides are lowercased.
 */
export function verifyPaytSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || typeof signature !== 'string' || !SIGNATURE_FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface PaytEvent {
  event_name: string;
  context?: Record<string, any>;
  event_time?: string;
}
