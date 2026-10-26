// Generated with: smtp2go-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type Smtp2goAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * SMTP2GO does not sign payloads. The only credential is the optional Authorization
 * header set on the webhook. Compare the WHOLE header value (e.g. "Bearer <token>"),
 * scheme prefix included; don't strip, parse or base64-decode it.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifySmtp2goRequest(
  headers: Headers,
  config: Smtp2goAuthConfig = process.env
): boolean {
  const expected = config.SMTP2GO_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

/** Body is flat JSON or form-encoded depending on the webhook's output type. */
export function parseBody(raw: string, contentType: string | null): Record<string, unknown> {
  if (contentType && /application\/x-www-form-urlencoded/i.test(contentType)) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Expected an object');
  }
  return payload as Record<string, unknown>;
}
