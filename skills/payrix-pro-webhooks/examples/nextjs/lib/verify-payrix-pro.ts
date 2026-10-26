// Generated with: payrix-pro-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Payrix Pro does not sign requests. It sends whatever Header Name / Header Value you
 * set on the webhook action. Compare the WHOLE header value with the expected value:
 * no prefix is stripped or parsed ("Bearer ..." is just part of the value).
 */
export function verifyPayrixProRequest(
  headers: Headers,
  secret: string | undefined = process.env.PAYRIX_PRO_WEBHOOK_SECRET,
  headerName: string = process.env.PAYRIX_PRO_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}

/** Parse JSON when the content type says so; otherwise keep the raw text. */
export function parseBody(
  raw: string,
  contentType: string | null
): { payload?: unknown; error?: string } {
  if (!raw) return { payload: null };
  if (/json/i.test(contentType ?? '')) {
    try {
      return { payload: JSON.parse(raw) };
    } catch {
      return { error: 'Invalid JSON body' };
    }
  }
  return { payload: raw };
}
