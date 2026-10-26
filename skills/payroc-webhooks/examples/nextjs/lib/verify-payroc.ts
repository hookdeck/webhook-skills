// Generated with: payroc-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Payroc does not sign payloads. Every request carries the subscription's secret as
 * plain text in the Payroc-Secret header. This authenticates the sender, not the body,
 * and gives no replay protection: use HTTPS, dedupe on the event id, rotate on leak.
 * Headers.get() is case-insensitive.
 */
export function verifyPayrocRequest(
  headers: Headers,
  secret: string | undefined = process.env.PAYROC_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('payroc-secret');
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on unequal lengths, so check them first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
