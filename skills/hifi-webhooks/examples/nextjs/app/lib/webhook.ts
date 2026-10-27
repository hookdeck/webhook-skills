import crypto from 'node:crypto';
type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const isHex = (value: string) => value.length === 64 && /^[0-9a-fA-F]{64}$/.test(value);

// A positive tolerance is an application policy. Zero leaves replay age unchecked.
export function verifySignature(rawBody: Buffer, header: string | null, secret: string, toleranceSeconds = 0): boolean {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || !secret) return false;
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) return false;
  let message = rawBody;
  let signatures: string[];
  const parts = header.split(',').map((part) => part.trim());
  const timestamps = parts.filter((part) => part.startsWith('t=')).map((part) => part.slice(2));
  if (timestamps.length !== 1 || !/^[0-9]+$/.test(timestamps[0])) return false;
  const timestamp = timestamps[0]; // Preserve the signed text; do not reformat it.
  if (toleranceSeconds > 0 && (!Number.isSafeInteger(Number(timestamp)) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds)) return false;
  message = Buffer.concat([Buffer.from(timestamp + '.', 'utf8'), rawBody]);
  signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  return signatures.some((signature) => {
    // Check length/alphabet BEFORE Buffer.from: Node silently truncates invalid hex.
    if (!isHex(signature)) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

export function getEventNames(payload: JsonObject): string[] {
  return typeof payload.eventType === 'string' ? [payload.eventType] : [];
}

export function handleEvent(payload: JsonObject) {
  for (const event of getEventNames(payload)) {
    switch (event) {
      case 'ONRAMP.STATUS.COMPLETED':
      case 'USER.CREATED':
      case 'CRYPTO_TRANSFER.CREATED':
        // Put durable, idempotent business processing here before acknowledging.
        console.log('Received HIFI event:', event);
        break;
      default:
        // Unknown events are acknowledged; never dump the full payload into logs.
        console.log('Unhandled HIFI event:', event);
    }
  }
}
