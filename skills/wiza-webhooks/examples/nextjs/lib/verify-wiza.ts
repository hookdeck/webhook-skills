// Generated with: wiza-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on unequal-length buffers.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Wiza does not sign the body. Every webhook carries an x-auth-key header: the lowercase hex
 * SHA-256 of your Wiza API key. It is the same on every request, so it proves who sent the
 * request, not that the body is intact, and it gives no replay protection.
 */
export function verifyWizaRequest(
  headers: Headers,
  apiKey: string | undefined = process.env.WIZA_API_KEY
): boolean {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers.get('x-auth-key');
  if (!received) return false;
  const expected = crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
  return safeEqual(received, expected);
}
