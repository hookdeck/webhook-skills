// Generated with: samsara-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Samsara signs each webhook with two headers:
//   X-Samsara-Timestamp: <unix seconds>
//   X-Samsara-Signature: v1=<hex HMAC-SHA256 of "v1:<timestamp>:<raw body>">
// The secret key on the webhook's page is base64: decode it to get the HMAC key.

/**
 * The secret is issued base64-encoded: the HMAC key is its decoded bytes.
 * Node's base64 decoder skips characters it doesn't know and ignores stray
 * bits, so insist on canonical base64 instead of keying with the wrong bytes.
 * Surrounding whitespace (a pasted trailing newline) is trimmed.
 */
export function decodeBase64Secret(secret: string | undefined | null): Buffer | null {
  const value = String(secret ?? '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length === 0) return null;
  if (key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

/** Constant-time comparison of two byte buffers that may differ in length. */
function bytesEqual(given: Buffer, expected: Buffer): boolean {
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function verifySamsaraWebhook(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined
): boolean {
  const key = decodeBase64Secret(secret);
  if (!key || !signature || !timestamp) return false;
  // "v1" is the only signature version; any other prefix is not from Samsara.
  const match = /^v1=((?:[0-9a-fA-F]{2})+)$/.exec(signature.trim());
  if (!match) return false;
  const expected = crypto
    .createHmac('sha256', key)
    .update(`v1:${timestamp}:`, 'utf8')
    .update(rawBody)
    .digest();
  return bytesEqual(Buffer.from(match[1], 'hex'), expected);
}

/** The fields every Samsara webhook payload carries. */
export interface SamsaraWebhookPayload {
  eventId?: string;
  eventMs?: number;
  eventType?: string;
  event?: unknown;
  [key: string]: unknown;
}

/**
 * Alert webhooks send eventType "Alert", and the Test button sends "Ping".
 * Event Subscriptions use their own eventType names, such as "DvirSubmitted".
 */
export function handleEvent(payload: unknown, _rawBody?: Buffer): { received: true; eventType: string | null } {
  const { eventId, eventType } = (payload ?? {}) as SamsaraWebhookPayload;
  switch (eventType) {
    case 'Ping':
      console.log(`Samsara test ping ${eventId}`);
      break;
    case 'Alert':
      console.log(`Samsara alert ${eventId}`);
      break;
    default:
      console.log(`Samsara ${eventType} event ${eventId}`);
  }
  // Samsara retries non-2xx responses: use eventId to skip duplicates.
  return { received: true, eventType: eventType ?? null };
}
