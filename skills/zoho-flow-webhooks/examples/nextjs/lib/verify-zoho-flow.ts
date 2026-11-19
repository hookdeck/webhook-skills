// Generated with: zoho-flow-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Zoho Flow's Send Webhook action is NOT signed. Have it send a secret header:
// an API Key auth profile with header placement, or a header on the action.
// A static credential authenticates the sender, not the body, and gives no
// replay protection.

export const DEFAULT_HEADER = 'X-Webhook-Secret';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verifyZohoFlowRequest(
  headers: Headers,
  name: string = process.env.ZOHO_FLOW_WEBHOOK_HEADER || DEFAULT_HEADER,
  secret: string | undefined = process.env.ZOHO_FLOW_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers lookup is case-insensitive
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

export type Payload =
  | { format: 'json'; data: unknown }
  | { format: 'form' | 'query'; data: Record<string, string> }
  | { format: 'text'; data: string };

/**
 * The body is whatever the action sends (Content-Type is "typically JSON").
 * Returns null for a body labelled JSON that doesn't parse. With no body (GET,
 * often DELETE) the query parameters are the payload.
 */
export function parsePayload(raw: string, contentType: string = '', query?: URLSearchParams): Payload | null {
  const type = contentType.toLowerCase();
  if (raw.trim() === '') return { format: 'query', data: Object.fromEntries(query ?? new URLSearchParams()) };
  if (type.includes('application/x-www-form-urlencoded')) {
    return { format: 'form', data: Object.fromEntries(new URLSearchParams(raw)) };
  }
  const looksJson = /^\s*[{[]/.test(raw);
  if (type.includes('json') || looksJson) {
    try {
      return { format: 'json', data: JSON.parse(raw) };
    } catch {
      return type.includes('json') ? null : { format: 'text', data: raw };
    }
  }
  return { format: 'text', data: raw };
}
