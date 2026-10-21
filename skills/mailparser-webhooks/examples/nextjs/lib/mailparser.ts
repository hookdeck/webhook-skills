// Generated with: mailparser-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

/**
 * MAILPARSER WEBHOOK AUTHENTICATION
 *
 * Mailparser does NOT sign webhooks: its docs describe no signature header,
 * HMAC or timestamp. An Advanced Webhook has an "Additional Headers" field
 * (one `Name: value` per line) sent unchanged on every request, e.g.
 * `X-Webhook-Secret: <random>` or `Authorization: Basic ...`.
 * Compare the WHOLE value, in constant time.
 */

/** Header name to check (Headers.get() is case-insensitive). */
export function headerName(
  env: Record<string, string | undefined> = process.env
): string {
  return (env.MAILPARSER_WEBHOOK_HEADER || 'x-webhook-secret').trim().toLowerCase();
}

/** Constant-time compare of the received header value. */
export function verifyMailparserHeader(
  received: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** No event ID exists, so hash the raw body as a fallback idempotency key. */
export function bodyHash(rawBody: string): string {
  return crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
}
