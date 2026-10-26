// Generated with: streak-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the token's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Streak does not sign payloads. If the webhook was created with a `token`, Streak
 * sends it as plain text in the X-Streak-Webhook-Token header; compare the WHOLE value.
 * A webhook created without a token sends nothing to verify.
 */
export function verifyStreakRequest(
  headers: Headers,
  token: string | undefined = process.env.STREAK_WEBHOOK_TOKEN
): boolean {
  if (!token) return false; // never accept when unconfigured
  const received = headers.get('x-streak-webhook-token');
  return Boolean(received) && safeEqual(received as string, token);
}
