// Generated with: checkr-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Checkr signs every webhook with X-Checkr-Signature: the lowercase hex
// HMAC-SHA256 of the raw request body. Checkr issues no dedicated webhook
// secret. The key is the OLDEST secret API key on a direct account, or the
// Partner app's OAuth client secret. Accounts without an API key get a
// placeholder sentence instead of a signature, which never verifies.

export interface CheckrEvent {
  id: string;
  object: 'event';
  type: string;
  created_at: string;
  webhook_url?: string;
  data?: { object?: { id?: string; object?: string; status?: string; result?: string; [key: string]: unknown } };
}

/** Verify X-Checkr-Signature against the exact bytes Checkr sent. */
export function verifyCheckrSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  key: string | null | undefined
): boolean {
  const secret = String(key ?? '').trim();
  const value = String(signature ?? '').trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}

/** data.object is the full object when include_object is on, otherwise id, object and uri. */
export function handleCheckrEvent(event: CheckrEvent) {
  const object = event.data?.object ?? {};
  switch (event.type) {
    case 'report.completed':
      console.log(`Report ${object.id} completed: status=${object.status} result=${object.result}`);
      break;
    case 'candidate.created':
    case 'candidate.updated':
      console.log(`${event.type}: candidate ${object.id}`);
      break;
    default:
      console.log(`Checkr event: ${event.type}`);
  }
  return { received: true, type: event.type, id: event.id };
}
