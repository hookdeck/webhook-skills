// Generated with: opsgenie-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on buffers of different sizes.
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Opsgenie does not sign webhooks. You add a custom header to the Webhook integration;
 * the header name is yours to choose. Compare the WHOLE header value with the secret,
 * exactly as typed in Opsgenie (a "Bearer " prefix, if you used one, is part of the value).
 * This authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyOpsgenieRequest(
  headers: Headers,
  headerName: string = process.env.OPSGENIE_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.OPSGENIE_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
