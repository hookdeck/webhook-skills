// Generated with: redo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type RedoAuthConfig = Record<string, string | undefined>;

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
 * Redo does not sign payloads. The only authentication is the static
 * `Authorization: Bearer <subscriber-secret>` header. Compare the complete header
 * value, including the "Bearer " prefix (do not strip or parse it).
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection: use HTTPS and rotate the secret if it leaks.
 */
export function verifyRedoRequest(
  headers: Headers,
  config: RedoAuthConfig = process.env
): boolean {
  const expected = config.REDO_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

export type RedoEvent = 'return.created' | 'return.updated' | 'backfill';

/**
 * Subscribe with the topics return.created and return.updated; the payload `type` is
 * the short form (created, updated), plus `backfill` for historical events.
 */
export function classify(payload: Record<string, unknown>): RedoEvent | null {
  switch (payload.type) {
    case 'created':
      return 'return.created';
    case 'updated':
      return 'return.updated';
    case 'backfill':
      return 'backfill';
    default:
      return null;
  }
}
