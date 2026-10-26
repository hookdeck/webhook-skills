// Generated with: mighty-networks-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const sha256 = (s: string): Buffer => crypto.createHash('sha256').update(s, 'utf8').digest();
const hasBearer = (v: string | null | undefined): v is string =>
  typeof v === 'string' && /^bearer /i.test(v);

/**
 * Mighty Networks does not sign payloads. It sends the API key you configured with the
 * webhook as "Authorization: Bearer <key>". The scheme matches in any case (RFC 9110); the key
 * is compared exactly, in constant time. Hashing both sides gives equal-length buffers, so
 * timingSafeEqual never throws.
 *
 * MIGHTY_NETWORKS_WEBHOOK_SECRET holds the bare key. If it starts with "Bearer " it is stripped.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyMightyNetworksRequest(
  headers: Headers,
  secret: string | undefined = process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const expected = hasBearer(secret) ? secret.slice(7) : secret;
  if (!expected) return false; // a configured value of just "Bearer " must not match
  const auth = headers.get('authorization');
  if (!expected || !hasBearer(auth)) return false;
  return crypto.timingSafeEqual(sha256(auth.slice(7)), sha256(expected));
}

// event_type arrives as "PostCreatedHook"; the docs name the event "PostCreated".
export function normalizeEventType(eventType: unknown): string {
  return typeof eventType === 'string' ? eventType.replace(/Hook$/, '') : '';
}
