// Generated with: knowbe4-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type Knowbe4AuthConfig = Record<string, string | undefined>;

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
 * KnowBe4 does not sign webhooks. You add a custom header (Key and Value) to the KSAT or
 * PhishER webhook; its name is yours to choose. Look it up case-insensitively (Headers does
 * this) and compare the WHOLE value (do not strip a "Bearer " prefix). A static secret
 * authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyKnowbe4Request(
  headers: Headers,
  config: Knowbe4AuthConfig = process.env
): boolean {
  const expected = config.KNOWBE4_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get(config.KNOWBE4_WEBHOOK_HEADER || 'Authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}
