// Generated with: dynatrace-webhooks skill
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
 * Dynatrace does not sign payloads. Authenticate with a secret header added as an
 * "Additional HTTP header" on the webhook integration. The header name is yours to
 * choose (DYNATRACE_WEBHOOK_HEADER, default Authorization); the expected value is the
 * exact, whole header value (DYNATRACE_WEBHOOK_SECRET). No "Bearer " parsing.
 */
export function verifyDynatraceRequest(
  headers: Headers,
  headerName: string = process.env.DYNATRACE_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.DYNATRACE_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
