// Generated with: honeycomb-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

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
 * Honeycomb does not sign payloads. It sends the webhook's Shared Secret as plain text
 * in the X-Honeycomb-Webhook-Token header. This authenticates the sender only: it does not
 * cover the body and gives no replay protection. Compare the WHOLE header value.
 */
export function verifyHoneycombRequest(
  headers: Headers,
  secret: string | undefined = process.env.HONEYCOMB_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get('x-honeycomb-webhook-token'); // case-insensitive lookup
  return Boolean(received) && safeEqual(received as string, secret);
}

export type AlertKind = 'trigger' | 'slo_burn_alert' | 'anomaly' | 'unknown';

/**
 * Honeycomb doesn't document the default payload field by field, and a webhook can use a
 * custom JSON template per alert type, so classify by the fields present. Illustrative only.
 */
export function classifyAlert(payload: Record<string, unknown>): AlertKind {
  const keys = Object.keys(payload);
  if (keys.some((k) => /^slo|burn|budget|exhaustion/i.test(k))) return 'slo_burn_alert';
  if (keys.some((k) => /anomal/i.test(k))) return 'anomaly';
  if (keys.some((k) => /^trigger|^threshold|^result/i.test(k))) return 'trigger';
  return 'unknown';
}
