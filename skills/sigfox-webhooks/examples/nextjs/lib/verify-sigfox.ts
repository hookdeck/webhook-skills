// Generated with: sigfox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison. timingSafeEqual throws on unequal lengths, so check
 * lengths first (the length of a random credential isn't a useful secret).
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Sigfox callbacks are not signed. You add a secret header to the callback's Headers;
 * the header name is yours (SIGFOX_WEBHOOK_HEADER, default Authorization) and the
 * expected value is the exact whole header value (SIGFOX_WEBHOOK_SECRET), including
 * any "Bearer " prefix you typed. A static credential authenticates the sender, not
 * the body, and gives no replay protection.
 */
export function verifySigfoxRequest(
  headers: Headers,
  secret: string | undefined = process.env.SIGFOX_WEBHOOK_SECRET,
  name: string = process.env.SIGFOX_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}

/**
 * The callback type isn't in the request, so infer it from the variables present.
 */
export function classifyCallback(p: Record<string, unknown>): string {
  if ('severity' in p) return 'error';
  if ('infoCode' in p) return 'service acknowledge';
  if ('repeatedMsg' in p) return 'service repeater';
  if ('lqi' in p || 'linkQuality' in p) return 'data advanced';
  if ('ack' in p || 'longPolling' in p) return 'data bidir';
  if ('batt' in p || 'temp' in p) return 'service status';
  if ('data' in p) return 'data uplink';
  return 'unknown';
}
