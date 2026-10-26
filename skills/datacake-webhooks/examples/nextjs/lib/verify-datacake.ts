// Generated with: datacake-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 * Header values are read as latin1 (how they are decoded), the secret as utf8.
 */
function safeEqual(received: string, expected: string): boolean {
  const ha = crypto.createHash('sha256').update(Buffer.from(received, 'latin1')).digest();
  const hb = crypto.createHash('sha256').update(Buffer.from(expected, 'utf8')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Datacake does not sign payloads. You add a secret header under Headers on the webhook
 * (Authorization or any name you choose) and the receiver compares the WHOLE value, exactly
 * as typed in Datacake, including any "Bearer " prefix. Nothing is stripped or parsed.
 * Headers.get() is case-insensitive.
 */
export function verifyDatacakeRequest(
  headers: Headers,
  headerName: string = process.env.DATACAKE_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.DATACAKE_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
