// Generated with: zoho-crm-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Zoho CRM workflow webhooks are NOT signed. Add a Custom Parameter under the
// webhook's Header (e.g. X-Webhook-Secret: <long random value>) and compare it.
// CRM only sends headers on POST and PUT. A static credential authenticates the
// sender, not the body, and gives no replay protection.

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

export function verifyZohoCrmRequest(
  headers: Headers,
  name: string = process.env.ZOHO_CRM_WEBHOOK_HEADER || DEFAULT_HEADER,
  secret: string | undefined = process.env.ZOHO_CRM_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers lookup is case-insensitive
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

export type ParsedBody =
  | { format: 'json'; data: unknown }
  | { format: 'form'; data: Record<string, string> }
  | { format: 'text'; data: string }
  | { format: 'empty'; data: null };

/**
 * The body is whatever you configured: Form-Data parameters or a Raw
 * Text/JSON/HTML/XML template. Returns null for a body labelled JSON that
 * doesn't parse.
 */
export function parseBody(raw: string, contentType: string = ''): ParsedBody | null {
  const type = contentType.toLowerCase();
  if (raw.trim() === '') return { format: 'empty', data: null };
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
