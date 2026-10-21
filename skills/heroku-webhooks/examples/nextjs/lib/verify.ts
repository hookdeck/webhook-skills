import crypto from 'crypto';

/** Constant-time string comparison that tolerates length mismatches. */
export function safeEqual(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false; // Different lengths = invalid
  }
}

/**
 * Verify the Heroku-Webhook-Hmac-SHA256 header.
 * Heroku sends base64(HMAC-SHA256(secret, raw body)); the secret is used as a raw string.
 */
export function verifyHerokuWebhook(
  rawBody: string,
  hmacHeader: string | null,
  secret: string | undefined
): boolean {
  if (!hmacHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return safeEqual(hmacHeader, expected);
}
