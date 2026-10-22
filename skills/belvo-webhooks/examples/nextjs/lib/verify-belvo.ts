// Generated with: belvo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type BelvoAuthConfig = Record<string, string | undefined>;

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
 * Belvo does not sign payloads. The only authentication is the optional static
 * `Authorization` header you configured on the webhook ("Bearer <token>" or
 * "Basic <base64>"). Compare the WHOLE header value, scheme prefix included;
 * don't strip or parse it. This proves who sent the request, not that the body
 * is untampered, and gives no replay protection.
 */
export function verifyBelvoRequest(
  headers: Headers,
  config: BelvoAuthConfig = process.env
): boolean {
  const expected = config.BELVO_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

export type BelvoKind =
  | { family: 'payments'; code: string }
  | { family: 'aggregation'; code: string; type?: string };

/**
 * Belvo has two body shapes: Payments (Mexico/Brazil) use eventType/eventCode,
 * Aggregation uses webhook_type/webhook_code.
 */
export function classify(payload: Record<string, unknown>): BelvoKind | null {
  if (typeof payload.eventCode === 'string') {
    return { family: 'payments', code: payload.eventCode };
  }
  if (typeof payload.webhook_code === 'string') {
    const type = typeof payload.webhook_type === 'string' ? payload.webhook_type : undefined;
    return { family: 'aggregation', code: payload.webhook_code, type };
  }
  return null;
}
