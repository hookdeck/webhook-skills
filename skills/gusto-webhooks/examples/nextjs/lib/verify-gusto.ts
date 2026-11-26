// Generated with: gusto-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Gusto (Embedded Payroll) signs event payloads with X-Gusto-Signature: the
// HMAC-SHA256 of the raw body, keyed with the subscription's
// verification_token, as a bare hex digest (Gusto's developer doc and Rails
// sample; the current guide doesn't name the encoding).

export interface GustoEvent {
  uuid: string;
  event_type: string;
  resource_type?: string;
  resource_uuid?: string;
  entity_type?: string;
  entity_uuid?: string;
  timestamp?: number;
}

/** Verify X-Gusto-Signature against the exact bytes Gusto sent. */
export function verifyGustoSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  token: string | null | undefined
): boolean {
  const secret = String(token ?? '').trim();
  const value = String(signature ?? '').trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}

/** The setup handshake carries verification_token and no event_type. */
export function verificationTokenFrom(rawBody: Buffer): string | null {
  try {
    const body = JSON.parse(rawBody.toString('utf8')) as { verification_token?: unknown; event_type?: unknown } | null;
    if (body && typeof body.verification_token === 'string' && body.event_type === undefined) {
      return body.verification_token;
    }
  } catch {
    // not JSON: not the handshake
  }
  return null;
}

/** Events carry UUIDs only; fetch the entity from the API for details. */
export function handleGustoEvent(event: GustoEvent) {
  if (event.event_type === 'payroll.paid') {
    console.log(`Payroll ${event.entity_uuid} paid for company ${event.resource_uuid}`);
  } else {
    console.log(`Gusto event: ${event.event_type}`);
  }
  return { received: true, event_type: event.event_type, uuid: event.uuid };
}
