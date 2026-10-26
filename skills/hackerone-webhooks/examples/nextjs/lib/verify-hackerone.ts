// Generated with: hackerone-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verify X-H1-Signature: "sha256=" + hex HMAC-SHA256 of the raw body, keyed with the
 * webhook secret (UTF-8 bytes, used as-is). Only the body is signed, so there is no
 * timestamp to check. The bare digest is accepted too.
 */
export function verifyHackerOne(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !signatureHeader) return false;
  let digest = signatureHeader.trim();
  if (digest.startsWith(SIGNATURE_PREFIX)) digest = digest.slice(SIGNATURE_PREFIX.length);
  // Validate length and alphabet before decoding: Buffer.from(x, 'hex') drops bad characters.
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(digest.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
