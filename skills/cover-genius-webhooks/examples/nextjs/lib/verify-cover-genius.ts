// Generated with: cover-genius-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the key's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Cover Genius Offers webhooks carry no payload signature. They send your
 * authentication key as plain text in the X-Api-Key header (no prefix).
 */
export function verifyCoverGeniusRequest(
  headers: Headers,
  apiKey: string | undefined = process.env.COVER_GENIUS_API_KEY
): boolean {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers.get('x-api-key');
  return received !== null && safeEqual(received, apiKey);
}
