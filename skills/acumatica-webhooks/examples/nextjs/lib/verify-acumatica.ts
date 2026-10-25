// Generated with: acumatica-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. timingSafeEqual throws on unequal lengths,
 * so check the lengths first.
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Acumatica does not sign push notifications. The Webhook destination adds one
 * user-chosen header (Header Name / Header Value). Headers.get() is
 * case-insensitive; compare the WHOLE value and do not strip a "Bearer " prefix.
 */
export function verifyAcumaticaRequest(
  headers: Headers,
  env: Record<string, string | undefined> = process.env
): boolean {
  const secret = env.ACUMATICA_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const name = env.ACUMATICA_WEBHOOK_HEADER || 'Authorization';
  const received = headers.get(name);
  return received !== null && safeEqual(received, secret);
}
