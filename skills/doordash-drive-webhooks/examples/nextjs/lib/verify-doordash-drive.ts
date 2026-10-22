// Generated with: doordash-drive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type DoorDashDriveAuthConfig = Record<string, string | undefined>;

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
 * DoorDash Drive does not sign payloads. Whatever text you enter in the Developer Portal
 * ("Basic Auth") is sent verbatim as the Authorization header. Compare the WHOLE header
 * value; don't strip a scheme prefix and don't base64-decode it as HTTP Basic.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection (no signature, no timestamp): use HTTPS and rotate the credential if it leaks.
 */
export function verifyDoorDashDriveRequest(
  headers: Headers,
  config: DoorDashDriveAuthConfig = process.env
): boolean {
  const expected = config.DOORDASH_DRIVE_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Delivery webhooks carry `event_name`. Refund webhooks have no event_name and nest
 * their data under `event_data`.
 */
export function classify(payload: Record<string, unknown>): string | null {
  if (typeof payload.event_name === 'string') return payload.event_name;
  if (payload.event_data && typeof payload.event_data === 'object') return 'refund';
  return null;
}
