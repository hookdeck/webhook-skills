// Generated with: parcellab-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type ParcellabAuthConfig = Record<string, string | undefined>;

export const CLOUDEVENT_TYPE_PREFIX = 'com.parcellab.tracking.event.';
export const EVENTS = [
  'onCreated',
  'onUpdated',
  'onDispatch',
  'onScheduled',
  'onDelay',
  'onInternalDelay',
  'onOutForDelivery',
  'onFailedAttempt',
  'onPickupReady',
  'onDelivered',
  'onReturn',
] as const;
const EVENTS_BY_LOWERCASE = new Map<string, string>(EVENTS.map((name) => [name.toLowerCase(), name]));

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * parcelLab does not sign payloads. It sends the HTTP Basic credentials you gave it:
 * `Authorization: Basic base64(username:password)`. Split on the FIRST colon (the
 * password may contain colons), then compare username and password each in constant
 * time. Both comparisons run before the decision, so there is no short-circuit.
 */
export function verifyParcellabRequest(
  headers: Headers,
  config: ParcellabAuthConfig = process.env
): boolean {
  const username = config.PARCELLAB_WEBHOOK_USERNAME;
  const password = config.PARCELLAB_WEBHOOK_PASSWORD;
  if (!username || !password) return false; // never accept when unconfigured

  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers.get('authorization') || '');
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return false;

  const usernameOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username, 'utf8'));
  const passwordOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password, 'utf8'));
  return usernameOk && passwordOk;
}

/**
 * Native payloads carry `event` (for example onDelivered). In CloudEvents format the
 * `type` is com.parcellab.tracking.event.<lowercased event>, e.g. ...event.ondelivered.
 */
export function getEventName(payload: Record<string, unknown>): string | null {
  if (typeof payload.event === 'string') return payload.event;
  if (typeof payload.type === 'string' && payload.type.startsWith(CLOUDEVENT_TYPE_PREFIX)) {
    const lowercased = payload.type.slice(CLOUDEVENT_TYPE_PREFIX.length).toLowerCase();
    // Accept the lowercased event name with or without the `on` prefix.
    return EVENTS_BY_LOWERCASE.get(lowercased) ?? EVENTS_BY_LOWERCASE.get(`on${lowercased}`) ?? null;
  }
  return null;
}
