// Generated with: ship24-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Ship24 does not sign payloads. Every webhook carries the account's Webhook Secret as
 * "Authorization: Bearer <secret>". The configured value is the bare secret (a pasted
 * "Bearer " prefix is stripped, as Hookdeck does). The scheme matches in any case; the
 * secret is compared exactly, in constant time.
 *
 * A static shared credential authenticates the sender, not the body, and gives no replay
 * protection (no signature, no timestamp): use HTTPS and rotate the secret if it leaks.
 */
export function verifyShip24Request(
  headers: Headers,
  configured: string | undefined = process.env.SHIP24_WEBHOOK_SECRET
): boolean {
  if (!configured) return false; // never accept when unconfigured
  const secret = Buffer.from(configured.replace(/^bearer /i, ''), 'utf8');
  if (!secret.length) return false; // a configured value of just "Bearer " must not match
  const header = headers.get('authorization');
  if (!header || header.slice(0, 7).toLowerCase() !== 'bearer ') return false;
  const received = Buffer.from(header.slice(7), 'latin1');
  // timingSafeEqual throws on unequal lengths, so check them first.
  return (
    secret.length > 0 &&
    received.length === secret.length &&
    crypto.timingSafeEqual(received, secret)
  );
}
