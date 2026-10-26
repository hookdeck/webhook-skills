// Generated with: project44-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * project44 does not sign payloads. With the API_KEY authentication method it adds a
 * header you named (api_key_name) with the value you chose. The header name is user-chosen,
 * so it comes from PROJECT44_WEBHOOK_HEADER; the expected value is the exact, whole header
 * value from PROJECT44_WEBHOOK_SECRET (no "Bearer " parsing).
 */
export function verifyProject44Request(
  headers: Headers,
  env: Record<string, string | undefined> = process.env
): boolean {
  const secret = env.PROJECT44_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const name = env.PROJECT44_WEBHOOK_HEADER || 'X-Api-Key';
  const received = headers.get(name); // Headers lookups are case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
