// Generated with: people-data-labs-webhooks skill
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
 * PDL does not sign payloads. The webhook carries the header the PDL team was
 * asked to add at registration. The header name is user-chosen; the expected value
 * is the exact, whole header value (a "Bearer " prefix, if any, is part of it).
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection, so use HTTPS and rotate the credential if it leaks.
 */
export function verifyPdlRequest(
  headers: Headers,
  name: string = process.env.PEOPLE_DATA_LABS_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.PEOPLE_DATA_LABS_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
