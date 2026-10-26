// Generated with: navattic-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type NavatticAuthConfig = Record<string, string | undefined>;

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
 * Navattic does not sign payloads. The only authentication is an Authorization header
 * ("Basic <credentials>" or "Bearer <token>"), sent only when configured on the webhook.
 * Compare the complete header value, including the scheme prefix. Don't parse or decode it.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyNavatticRequest(
  headers: Headers,
  config: NavatticAuthConfig = process.env
): boolean {
  const expected = config.NAVATTIC_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

export type NavatticDataKind = 'visitor' | 'account';

/**
 * Visitor events carry { session, endUser, companyAccount }. Account events carry the
 * company account object itself as `data`.
 */
export function classifyData(data: unknown): NavatticDataKind | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.session) return 'visitor';
  if (d.id || d.websiteDomain) return 'account';
  return null;
}
