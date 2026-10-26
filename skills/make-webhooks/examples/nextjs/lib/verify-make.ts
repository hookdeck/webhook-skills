// Generated with: make-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type MakeAuthConfig = Record<string, string | undefined>;

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
 * Make's HTTP module does not sign requests. With an API key keychain (placement
 * "In the header") it sends <parameter name>: <Key>, exactly as entered. Compare
 * the WHOLE header value: don't strip a "Bearer " prefix, it is part of the Key.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection (no signature, no timestamp).
 */
export function verifyMakeRequest(
  headers: Headers,
  config: MakeAuthConfig = process.env
): boolean {
  const expected = config.MAKE_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured

  const headerName = config.MAKE_WEBHOOK_HEADER || 'Authorization';
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return received !== null && safeEqual(received, expected);
}
