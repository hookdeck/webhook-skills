// Generated with: close-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Close (close.com) signs each webhook with two headers:
//   close-sig-timestamp: <unix seconds>
//   close-sig-hash: <hex HMAC-SHA256 of timestamp + raw body, no delimiter>
// The subscription's signature_key is HEX: decode it to get the HMAC key.
// (Decoding it as base64 also "works" and gives 48 wrong bytes.)

/**
 * The key is issued hex-encoded: the HMAC key is its decoded bytes.
 * Node's hex decoder stops at the first non-hex character, so check the whole
 * string first. Surrounding whitespace (a pasted trailing newline) is trimmed.
 */
export function decodeHexSecret(secret: string | undefined | null): Buffer | null {
  const value = String(secret ?? '').trim();
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) return null;
  return Buffer.from(value, 'hex');
}

/** Constant-time comparison of two byte buffers that may differ in length. */
function bytesEqual(given: Buffer, expected: Buffer): boolean {
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function verifyCloseWebhook(
  rawBody: Buffer | string,
  sigHash: string | null | undefined,
  timestamp: string | null | undefined,
  signatureKey: string | undefined
): boolean {
  const key = decodeHexSecret(signatureKey);
  const given = String(sigHash ?? '').trim();
  if (!key || !timestamp || !/^(?:[0-9a-fA-F]{2})+$/.test(given)) return false;
  // The timestamp and the body are concatenated with no delimiter.
  const expected = crypto.createHmac('sha256', key).update(timestamp, 'utf8').update(rawBody).digest();
  return bytesEqual(Buffer.from(given, 'hex'), expected);
}

/** The fields of a Close webhook event this example reads. */
export interface CloseEvent {
  id?: string;
  object_type?: string;
  action?: string;
  object_id?: string;
  lead_id?: string;
  changed_fields?: string[];
  data?: Record<string, unknown>;
  previous_data?: Record<string, unknown>;
  [key: string]: unknown;
}

export function handleEvent(payload: unknown, _rawBody?: Buffer): { received: true; event: string } {
  const event: CloseEvent = ((payload as { event?: CloseEvent } | null)?.event) ?? {};
  const name = `${event.object_type}.${event.action}`;
  switch (name) {
    case 'lead.created':
      console.log(`Close lead created: ${event.object_id}`);
      break;
    case 'opportunity.updated':
      console.log(`Close opportunity ${event.object_id} changed: ${(event.changed_fields ?? []).join(', ')}`);
      break;
    default:
      console.log(`Close ${name} event ${event.id}`);
  }
  // Close retries for up to 72 hours: use event.id to skip duplicates.
  return { received: true, event: name };
}
