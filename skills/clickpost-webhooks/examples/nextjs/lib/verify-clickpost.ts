// Generated with: clickpost-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const SCHEME = 'token ';

/** Constant-time compare: hash both sides so the buffers are equal length. */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * ClickPost does not sign payloads. With Simple Token authentication it sends
 * `Authorization: Token <secret>`. The scheme is "Token" (not "Bearer") and is
 * matched case-insensitively. The secret is stored bare; if the configured value
 * itself starts with "Token ", strip it. The secret is never trimmed or altered.
 */
export function verifyClickPostRequest(
  headers: Headers,
  configured: string | undefined = process.env.CLICKPOST_WEBHOOK_SECRET
): boolean {
  if (!configured) return false; // never accept when unconfigured
  const secret = configured.toLowerCase().startsWith(SCHEME)
    ? configured.slice(SCHEME.length)
    : configured;
  const header = headers.get('authorization');
  if (!header || header.slice(0, SCHEME.length).toLowerCase() !== SCHEME) return false;
  return safeEqual(header.slice(SCHEME.length), secret);
}
