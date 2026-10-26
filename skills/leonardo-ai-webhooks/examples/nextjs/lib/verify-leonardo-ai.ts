// Generated with: leonardo-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)

/**
 * Leonardo.Ai does not sign payloads. If a webhook callback API key is set, every
 * callback carries "Authorization: Bearer <key>". The configured secret is the bare
 * key; a pasted "Bearer <key>" is tolerated (stripped) like Hookdeck does.
 * A static credential authenticates the sender, not the body, and has no replay protection.
 */
export function verifyLeonardoRequest(
  headers: Headers,
  configured: string | undefined = process.env.LEONARDO_AI_WEBHOOK_SECRET
): boolean {
  if (!configured) return false; // never accept when unconfigured
  const secret = BEARER.test(configured) ? configured.slice(7) : configured;
  if (!secret) return false; // a configured value of just "Bearer " must not match
  const header = headers.get('authorization') || '';
  if (!BEARER.test(header)) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  // timingSafeEqual throws on unequal lengths, so check them first.
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
