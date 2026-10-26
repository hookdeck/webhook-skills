// Generated with: quickbase-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Quickbase does not sign webhooks. You add a secret header in the webhook's Message header
 * list; the header name is yours (QUICKBASE_WEBHOOK_HEADER, default Authorization) and the
 * expected value is the exact, whole header value (QUICKBASE_WEBHOOK_SECRET), including any
 * "Bearer " prefix. Never strip or parse a prefix: compare the whole value.
 *
 * This authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyQuickbaseRequest(
  headers: Headers,
  secret: string | undefined = process.env.QUICKBASE_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const name = process.env.QUICKBASE_WEBHOOK_HEADER || 'Authorization';
  const received = headers.get(name); // Headers lookup is case-insensitive
  if (received === null) return false;
  const a = Buffer.from(received, 'latin1'); // header bytes are exposed as latin1 text
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
