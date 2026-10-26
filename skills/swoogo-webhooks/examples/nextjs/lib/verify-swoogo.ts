// Generated with: swoogo-webhooks skill
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
 * Swoogo does not sign payloads. The user adds a secret header to the webhook
 * (headers: [{key, value}]). The name is user-chosen, so it comes from
 * SWOOGO_WEBHOOK_HEADER; the expected value is the exact, whole header value
 * (including any "Bearer " prefix), so it is compared as-is, never parsed.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifySwoogoRequest(
  headers: Headers,
  name: string = process.env.SWOOGO_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.SWOOGO_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}

/** Webhooks are json (application/json) or post (form-encoded): accept both. */
export function parseBody(raw: string, contentType: string = ''): Record<string, unknown> | null {
  if (contentType.includes('x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
