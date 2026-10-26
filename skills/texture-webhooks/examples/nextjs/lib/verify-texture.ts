// Generated with: texture-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Texture-Signature is the lowercase hex HMAC-SHA256 of the raw request body, keyed with the
 * destination secret (UTF-8 bytes, used as-is, whsec_ prefix included). Nothing else is signed.
 * Validate the format before decoding: Buffer.from(sig, 'hex') silently drops bad characters.
 */
export function verifyTextureSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false; // exact length and alphabet
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // hex is case-insensitive
  return crypto.timingSafeEqual(expected, received); // both are 32 bytes
}
