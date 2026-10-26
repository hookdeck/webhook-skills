// Generated with: paxos-webhooks skill
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
 * Paxos does not sign webhook events. With Auth Type "API Key", Paxos sends the header
 * name and value you configured on the webhook. The whole header value is compared
 * as-is (no "Bearer " parsing). Headers.get() is case-insensitive.
 */
export function verifyPaxosRequest(
  headers: Headers,
  secret: string | undefined = process.env.PAXOS_WEBHOOK_SECRET,
  headerName: string = process.env.PAXOS_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
