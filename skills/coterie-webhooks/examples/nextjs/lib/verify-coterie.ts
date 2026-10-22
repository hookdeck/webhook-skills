// Generated with: coterie-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export interface CoterieAuthConfig {
  COTERIE_AUTHENTICATION?: string;
}

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the token's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Coterie does not sign payloads. The only authentication is an opt-in static header
 * named `Authentication` (not `Authorization`) whose whole value is `token <guid>`.
 * Compare the complete header value, including the "token " prefix.
 */
export function verifyCoterieRequest(
  headers: Headers,
  config: CoterieAuthConfig = process.env
): boolean {
  const expected = config.COTERIE_AUTHENTICATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authentication');
  if (!received) return false;
  return safeEqual(received, expected);
}

export type CoterieKind = 'application' | 'quote' | 'policy';

/**
 * Coterie webhooks have no event-type field. The three kinds are told apart by
 * their identifier key.
 */
export function classify(payload: Record<string, unknown>): CoterieKind | null {
  const keys = new Set(Object.keys(payload).map((k) => k.toLowerCase()));
  if (keys.has('quoteid')) return 'quote';
  if (keys.has('policyid')) return 'policy';
  if (keys.has('applicationid')) return 'application';
  return null;
}
