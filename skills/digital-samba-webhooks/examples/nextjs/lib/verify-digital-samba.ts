// Generated with: digital-samba-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/** Constant-time comparison of SHA-256 digests (equal-length buffers, so it never throws). */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)

/**
 * Digital Samba does not sign payloads. When authorization_header is set on the
 * webhook, every POST carries "Authorization: Bearer <secret>". The secret is a
 * static shared credential: it authenticates the sender, not the body, and gives
 * no replay protection.
 */
export function verifyDigitalSambaRequest(
  headers: Headers,
  secret: string | undefined = process.env.DIGITAL_SAMBA_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  // Tolerate a configured value that already includes "Bearer " (the secret itself is not trimmed).
  const expected = BEARER.test(secret) ? secret.slice(7) : secret;
  if (!expected) return false;

  const header = headers.get('authorization');
  if (!header || !BEARER.test(header)) return false;

  // Header values are decoded as latin1; re-encode to recover the original bytes.
  return safeEqual(Buffer.from(header.slice(7), 'latin1'), Buffer.from(expected, 'utf8'));
}
