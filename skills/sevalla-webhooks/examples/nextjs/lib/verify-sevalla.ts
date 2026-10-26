// Generated with: sevalla-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Sevalla does not sign requests. The svl-signature header is NOT a signature: it carries
 * the webhook's signing secret itself (whsec_ + 30 characters). Compare the whole value
 * with the stored secret. The old secret is accepted too while a rollover is under way.
 */
export function verifySevallaRequest(
  headers: Headers,
  secrets: Array<string | undefined> = [
    process.env.SEVALLA_WEBHOOK_SECRET,
    process.env.SEVALLA_WEBHOOK_SECRET_OLD,
  ]
): boolean {
  const received = headers.get('svl-signature');
  if (received === null) return false;
  return secrets.some((secret) => Boolean(secret) && safeEqual(received, secret as string));
}
