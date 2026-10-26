// Generated with: soniox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export interface SonioxAuthOptions {
  name?: string;
  secret?: string;
}

/**
 * Soniox does not sign payloads. It sends the header you set per transcription via
 * webhook_auth_header_name / webhook_auth_header_value. Headers.get() is case-insensitive;
 * compare the WHOLE value (no Bearer parsing). This authenticates the sender only:
 * no signature, no timestamp, no replay protection.
 */
export function verifySonioxRequest(
  headers: Headers,
  {
    name = process.env.SONIOX_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.SONIOX_WEBHOOK_SECRET,
  }: SonioxAuthOptions = {}
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name);
  return Boolean(received) && safeEqual(received as string, secret);
}
