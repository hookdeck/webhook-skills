import crypto from 'node:crypto';
type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const isHex = (value: string) => value.length === 64 && /^[0-9a-fA-F]{64}$/.test(value);

// This signature covers only the body; there is no signed timestamp to check.
export function verifySignature(rawBody: Buffer, header: string | null, secret: string, toleranceSeconds = 0): boolean {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || !secret) return false;
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) return false;
  let message = rawBody;
  let signatures: string[];
  signatures = [header];
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  return signatures.some((signature) => {
    // Check length/alphabet BEFORE Buffer.from: Node silently truncates invalid hex.
    if (!isHex(signature)) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

export function getEventNames(payload: JsonObject): string[] {
  const events = payload.event;
  return isObject(events) ? Object.keys(events).filter((key) => isObject(events[key])) : [];
}

export function handleEvent(payload: JsonObject) {
  for (const event of getEventNames(payload)) {
    switch (event) {
      case 'questionAnswered':
      case 'surveyCompleted':
        // Put durable, idempotent business processing here before acknowledging.
        console.log('Received Survicate event:', event);
        break;
      default:
        // Unknown events are acknowledged; never dump the full payload into logs.
        console.log('Unhandled Survicate event:', event);
    }
  }
}
