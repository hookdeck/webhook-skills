// Generated with: invoice-ninja-webhooks skill
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
 * Invoice Ninja does not sign payloads. You add a secret header (key/value) to the
 * webhook; the header name is yours, so it comes from configuration. The WHOLE value
 * is compared, including any "Bearer " prefix you typed: nothing is stripped or parsed.
 * Headers.get() is case-insensitive.
 */
export function verifyInvoiceNinjaRequest(
  headers: Headers,
  secret: string | undefined = process.env.INVOICE_NINJA_WEBHOOK_SECRET,
  headerName: string = process.env.INVOICE_NINJA_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}

/**
 * The body is the entity itself (transformer output) and has NO event field. The
 * event key (create_invoice, ...) only names the subscription, so route by URL
 * (add ?event=create_invoice to the target URL) or fall back to the entity's shape.
 */
export function detectEntity(payload: Record<string, unknown>): 'document' | 'payment' | 'client' | 'unknown' {
  if (Array.isArray(payload.line_items)) return 'document'; // invoice, quote, credit, purchase order
  if ('applied' in payload || 'transaction_reference' in payload) return 'payment';
  if (Array.isArray(payload.contacts)) return 'client';
  return 'unknown';
}
