// Generated with: speechmatics-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Reads SPEECHMATICS_WEBHOOK_HEADER and SPEECHMATICS_WEBHOOK_SECRET
export type SpeechmaticsAuthConfig = Record<string, string | undefined>;

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
 * Speechmatics does not sign notifications. It sends the header you listed in
 * notification_config[].auth_headers, verbatim. The whole value is compared:
 * a "Bearer " prefix is part of the value, not parsed off.
 * Headers.get() is case-insensitive, so the configured name can be any case.
 * A static credential authenticates the sender only: no body signature, no replay protection.
 */
export function verifySpeechmaticsRequest(
  headers: Headers,
  config: SpeechmaticsAuthConfig = process.env
): boolean {
  const name = config.SPEECHMATICS_WEBHOOK_HEADER || 'Authorization';
  const expected = config.SPEECHMATICS_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured

  let received: string | null;
  try {
    received = headers.get(name);
  } catch {
    return false; // a configured name that isn't a valid header name
  }
  return received !== null && safeEqual(received, expected);
}
