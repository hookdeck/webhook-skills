// Generated with: lokalise-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type LokaliseAuthConfig = Record<string, string | undefined>;

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
 * Lokalise does not sign webhook payloads. It sends the webhook secret you
 * configured as-is in a request header: X-Secret by default, or X-Api-Key / a
 * custom header if you chose one in the Webhooks app. Set LOKALISE_WEBHOOK_HEADER
 * to match.
 */
export function verifyLokaliseRequest(
  headers: Headers,
  config: LokaliseAuthConfig = process.env
): boolean {
  const secret = config.LOKALISE_WEBHOOK_SECRET;
  const headerName = config.LOKALISE_WEBHOOK_HEADER || 'X-Secret';
  if (!secret) return false; // never accept when unconfigured

  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
