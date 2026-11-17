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

const KINDS = ['trigger', 'budget_rate', 'exhaustion_time', 'anomaly'] as const;
export type AlertKind = (typeof KINDS)[number] | 'unknown';

/**
 * Honeycomb sends no event-type field or header, and doesn't document the standard payload
 * field by field. Enable a custom payload template for each alert type and put a constant
 * "kind" field in each one (see SKILL.md). Anything else is classed as unknown.
 */
export function classifyAlert(payload: Record<string, unknown>): AlertKind {
  const kind = payload.kind;
  return (KINDS as readonly unknown[]).includes(kind) ? (kind as AlertKind) : 'unknown';
}
