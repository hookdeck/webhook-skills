// Generated with: copper-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. timingSafeEqual throws on unequal lengths,
 * so check lengths first and only compare equal-length Buffers.
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Copper does not sign payloads. Authenticate with a secret header you add through the
 * subscription's "headers" object. The header name is yours (COPPER_WEBHOOK_HEADER) and the
 * expected value is the exact, whole header value (COPPER_WEBHOOK_SECRET): no 'Bearer ' parsing.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyCopperRequest(
  headers: Headers,
  expected: string | undefined = process.env.COPPER_WEBHOOK_SECRET
): boolean {
  if (!expected) return false; // never accept when unconfigured
  const name = process.env.COPPER_WEBHOOK_HEADER || 'X-Webhook-Secret';
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, expected);
}
