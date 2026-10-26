// Generated with: gc-notify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * GC Notify does not sign callbacks. It adds `Authorization: Bearer <token>` to every
 * request, where the token is the one you set for the callback. The configured value is
 * the bare token; if it was pasted with a leading "Bearer " the scheme is stripped.
 * The secret is never trimmed or otherwise altered.
 */
export function verifyGcNotifyRequest(
  headers: Headers,
  configured: string | undefined = process.env.GC_NOTIFY_WEBHOOK_SECRET
): boolean {
  const secret = configured ? configured.replace(BEARER, '') : '';
  if (!secret) return false; // never accept when unconfigured
  const header = headers.get('authorization');
  if (header === null || !BEARER.test(header)) return false;
  // Header bytes are exposed as latin1 characters; re-encode to recover the raw bytes.
  return safeEqual(Buffer.from(header.slice(7), 'latin1'), Buffer.from(secret, 'utf8'));
}
