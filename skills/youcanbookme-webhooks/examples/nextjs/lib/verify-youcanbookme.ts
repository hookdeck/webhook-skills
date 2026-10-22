// Generated with: youcanbookme-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Hashing both sides gives equal-length buffers, so timingSafeEqual never throws.
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest();

/**
 * YouCanBookMe does not sign payloads. You add a secret Request Header (name and value of your
 * choosing) to the webhook action; compare the WHOLE header value. Headers.get() is
 * case-insensitive. A static credential authenticates the sender, not the body, and gives no
 * replay protection.
 */
export function verifyYoucanbookmeRequest(
  headers: Headers,
  secret: string | undefined = process.env.YOUCANBOOKME_WEBHOOK_SECRET,
  headerName: string = process.env.YOUCANBOOKME_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && crypto.timingSafeEqual(sha256(received as string), sha256(secret));
}
