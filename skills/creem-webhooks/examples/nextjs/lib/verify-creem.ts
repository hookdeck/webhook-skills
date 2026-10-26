// Generated with: creem-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Creem sends creem-signature: bare lowercase hex HMAC-SHA256 of the raw request
 * body, keyed with the endpoint's signing secret used as a UTF-8 string (no prefix, no timestamp).
 * The 64-hex check comes first because Buffer.from(x, 'hex') silently truncates bad input.
 */
export function verifyCreemSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.CREEM_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
