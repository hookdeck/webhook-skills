// Generated with: postscript-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Postscript does not sign payloads. The Postscript-Signature header carries the
 * account's webhook signing token (from GET /api/v2/webhooks/token) as plain text,
 * so the whole header value is compared with the stored token. This authenticates
 * the sender, not the body, and gives no replay protection: use HTTPS and keep
 * the token secret (the docs call it fixed and document no rotation).
 */
export function verifyPostscriptRequest(
  headers: Headers,
  token: string | undefined = process.env.POSTSCRIPT_WEBHOOK_TOKEN
): boolean {
  if (!token) return false; // never accept when unconfigured
  const received = headers.get('postscript-signature');
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(token);
  // timingSafeEqual throws on unequal lengths, so check them first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
