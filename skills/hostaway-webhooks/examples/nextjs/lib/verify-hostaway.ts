// Generated with: hostaway-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/** Constant-time compare: SHA-256 digests are always the same length, so timingSafeEqual never throws. */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse 'Authorization: Basic base64(username:password)'. The scheme is case-insensitive,
 * the base64 must be strictly valid (no junk after valid credentials), and the split is on
 * the first colon so the password may contain colons. Returns null when malformed.
 */
export function parseBasicAuth(header: string | null): { username: string; password: string } | null {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const encoded = match[1];
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.toString('base64') !== encoded) return null; // not canonical base64
  const text = decoded.toString('utf8');
  const colon = text.indexOf(':');
  if (colon === -1) return null;
  return { username: text.slice(0, colon), password: text.slice(colon + 1) };
}

/**
 * Hostaway does not sign payloads. If you set a login and password on the webhook, Hostaway
 * sends them as HTTP Basic auth. The static credential authenticates the sender, not the body.
 */
export function verifyHostawayRequest(
  headers: Headers,
  username: string | undefined = process.env.HOSTAWAY_WEBHOOK_USERNAME,
  password: string | undefined = process.env.HOSTAWAY_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}

/**
 * The unified webhook payload isn't documented field by field, so read the event name
 * defensively: `event`, `eventType`, or `object` + `action` (e.g. reservation + created).
 */
export function getEventName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.event === 'string') return p.event;
  if (typeof p.eventType === 'string') return p.eventType;
  if (typeof p.object === 'string' && typeof p.action === 'string') return `${p.object}.${p.action}`;
  return null;
}
