// Generated with: omnisend-webhooks skill
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

export interface OmnisendAuthOptions {
  headerName?: string;
  secret?: string;
}

/**
 * Omnisend does not sign webhooks. Authenticate with a shared secret header you add to the
 * automation's send webhook action. The header name is user-chosen (OMNISEND_WEBHOOK_HEADER,
 * default X-Webhook-Secret); the whole header value must equal OMNISEND_WEBHOOK_SECRET
 * (no Bearer parsing). This authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyOmnisendRequest(
  headers: Headers,
  {
    headerName = process.env.OMNISEND_WEBHOOK_HEADER || 'X-Webhook-Secret',
    secret = process.env.OMNISEND_WEBHOOK_SECRET,
  }: OmnisendAuthOptions = {}
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return received !== null && safeEqual(received, secret);
}
