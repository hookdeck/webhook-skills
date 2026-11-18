// Generated with: marqeta-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Marqeta authenticates every webhook with HTTP Basic auth (both credentials
// are required on the webhook). If the webhook also has a secret and
// signature_algorithm, X-Marqeta-Signature carries the lowercase hex
// HMAC-SHA256 (or legacy HMAC-SHA1) of the raw body.

export type MarqetaAlgorithm = 'sha256' | 'sha1';

/** Keyed by notification type: { transactions: [...] }, { cardtransitions: [...] }, ... */
export type MarqetaMessage = Record<string, unknown>;

const HEX_LENGTH: Record<MarqetaAlgorithm, number> = { sha256: 64, sha1: 40 };

/** Constant-time string comparison that doesn't leak the length. */
function safeEqual(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/** Check the Authorization header against the webhook's Basic auth credentials. */
export function verifyBasicAuth(
  authorization: string | null | undefined,
  username: string | null | undefined,
  password: string | null | undefined
): boolean {
  if (!username || !password) return false;
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(String(authorization ?? ''));
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':'); // the password may contain ':'
  if (separator < 0) return false;
  const userOk = safeEqual(decoded.slice(0, separator), username);
  const passOk = safeEqual(decoded.slice(separator + 1), password);
  return userOk && passOk;
}

/** "sha256" (default), "sha1", or "sha256,sha1" while you switch algorithms. */
export function parseAlgorithms(value: string | null | undefined): MarqetaAlgorithm[] {
  return String(value || 'sha256')
    .toLowerCase()
    .split(',')
    .map((a) => a.trim())
    .filter((a): a is MarqetaAlgorithm => a === 'sha256' || a === 'sha1');
}

/** Verify X-Marqeta-Signature: hex HMAC of the exact raw body. */
export function verifyMarqetaSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string,
  algorithms: MarqetaAlgorithm[] = ['sha256']
): boolean {
  const value = String(signature ?? '').trim();
  if (!secret || !/^[0-9a-fA-F]+$/.test(value)) return false;
  const given = Buffer.from(value, 'hex');
  let ok = false;
  for (const algorithm of algorithms) {
    if (value.length !== HEX_LENGTH[algorithm]) continue;
    const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest();
    ok = crypto.timingSafeEqual(given, expected) || ok;
  }
  return ok;
}

/** Up to 10 notifications per type; dedupe on each notification's token. */
export function handleMarqetaNotifications(message: MarqetaMessage) {
  const counts: Record<string, number> = {};
  for (const [type, notifications] of Object.entries(message)) {
    if (!Array.isArray(notifications)) continue;
    counts[type] = notifications.length;
    console.log(`Marqeta ${type}: ${notifications.length} notification(s)`);
  }
  return { received: true, counts };
}
