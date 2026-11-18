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

/** Webhooks 1.0: alerts, and Ping from the Test button. */
export interface SamsaraWebhookV1Payload {
  eventId: string;
  eventMs: number; // epoch milliseconds when Samsara sent it
  eventType: string; // "Alert" or "Ping"
  event: unknown;
}

/** Webhooks 2.0 Event Subscriptions, such as DvirSubmitted. */
export interface SamsaraWebhookV2Payload {
  eventId: string;
  eventTime: string; // RFC 3339
  eventType: string; // e.g. "DvirSubmitted"
  orgId: number;
  webhookId: string;
  data: unknown;
}

export type SamsaraWebhookPayload = SamsaraWebhookV1Payload | SamsaraWebhookV2Payload;

export function handleEvent(
  payload: unknown,
  _rawBody?: Buffer
): { received: true; eventType: string | null; occurredAt: string | null } {
  // Read either shape: every field is optional until you know which one arrived.
  const body = (payload && typeof payload === 'object' ? payload : {}) as Partial<
    SamsaraWebhookV1Payload & SamsaraWebhookV2Payload
  >;
  const { eventId, eventType } = body;
  const details = body.data !== undefined ? body.data : body.event; // 2.0 data, 1.0 event
  const occurredAt =
    body.eventTime ?? (typeof body.eventMs === 'number' ? new Date(body.eventMs).toISOString() : null);
  switch (eventType) {
    case 'Ping':
      console.log(`Samsara test ping ${eventId}`);
      break;
    case 'Alert':
      console.log(`Samsara alert ${eventId} at ${occurredAt}`, details);
      break;
    case 'DvirSubmitted':
      console.log(`Samsara DVIR submitted ${eventId} at ${occurredAt} (org ${body.orgId})`);
      break;
    default:
      console.log(`Samsara ${eventType} event ${eventId} at ${occurredAt}`);
  }
  // Samsara retries non-2xx responses: use eventId to skip duplicates.
  return { received: true, eventType: eventType ?? null, occurredAt };
}
