// Generated with: amplitude-webhooks skill
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

/**
 * Amplitude does not sign webhook requests. You add a secret header in the
 * destination's header rows; the name is your choice. Headers.get() is
 * case-insensitive. The WHOLE value is compared: a "Bearer " prefix typed in
 * Amplitude is part of the expected secret.
 */
export function verifyAmplitudeRequest(
  headers: Headers,
  secret: string | undefined = process.env.AMPLITUDE_WEBHOOK_SECRET,
  headerName: string = process.env.AMPLITUDE_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}
