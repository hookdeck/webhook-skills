// Generated with: builder-io-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on buffers of different length.
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Builder.io does not sign webhooks. Authenticate with the secret custom header you added to the
 * webhook. The header name is yours to choose; the secret is the exact, whole header value
 * (including any "Bearer " prefix). A static credential authenticates the sender, not the body,
 * and gives no replay protection: use HTTPS and rotate it if it leaks.
 */
export function verifyBuilderRequest(
  headers: Headers,
  header: string = process.env.BUILDER_IO_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.BUILDER_IO_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(header); // Headers.get is case-insensitive
  return received !== null && safeEqual(received, secret);
}
