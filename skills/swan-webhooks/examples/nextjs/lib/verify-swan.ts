// Generated with: swan-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on buffers of different length.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Swan does not sign payloads. When the subscription has a webhook secret, every request
 * carries it as plain text in the x-swan-secret header. Compare the WHOLE header value
 * with the secret. (Headers#get is case-insensitive.)
 */
export function verifySwanRequest(
  headers: Headers,
  secret: string | undefined = process.env.SWAN_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('x-swan-secret');
  return Boolean(received) && safeEqual(received as string, secret);
}

// Swan delivers at least once, so the same eventId can arrive more than once.
// In production use a durable store (database, Redis) instead of process memory.
export const processedEventIds = new Set<string>();
