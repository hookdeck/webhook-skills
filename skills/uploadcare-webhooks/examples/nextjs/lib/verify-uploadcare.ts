// Generated with: uploadcare-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify X-Uc-Signature: "v1=" + lowercase hex HMAC-SHA256(signing secret, raw body).
 * Only the body is signed (no timestamp), so there is no replay window to check.
 */
export function verifyUploadcareSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string | undefined = process.env.UPLOADCARE_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof header !== 'string') return false;
  let sig = header.trim();
  if (sig.toLowerCase().startsWith('v1=')) sig = sig.slice(3); // a bare digest is also accepted
  sig = sig.toLowerCase();
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}
