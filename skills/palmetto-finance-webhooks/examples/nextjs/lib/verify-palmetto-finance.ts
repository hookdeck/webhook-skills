// Generated with: palmetto-finance-webhooks skill
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
 * Palmetto Finance does not sign payloads. With the default server API key
 * authentication, every delivery carries the key Palmetto returned at registration
 * in a header (apiKey by default; some pages show api_key). We compare the WHOLE
 * header value, with no 'Bearer ' parsing, which is what Hookdeck's source does.
 * Headers.get() is case-insensitive.
 */
export function verifyPalmettoFinanceRequest(
  headers: Headers,
  secret: string | undefined = process.env.PALMETTO_FINANCE_WEBHOOK_SECRET,
  headerName: string = process.env.PALMETTO_FINANCE_WEBHOOK_HEADER || 'apiKey'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
