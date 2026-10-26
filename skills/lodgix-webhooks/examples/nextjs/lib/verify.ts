import { createHmac, timingSafeEqual } from 'crypto';

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify X-Lodgix-Signature: sha256=<hex of HMAC_SHA256(secret, "{timestamp}.{raw body}")>.
 * `rawBody` must be the exact bytes received.
 */
export function verifyLodgixSignature(
  rawBody: Buffer,
  timestamp: string | null | undefined,
  signature: string | null | undefined,
  secret: string,
  toleranceSeconds = 0
): VerifyResult {
  if (!timestamp || !signature) {
    return { valid: false, error: 'Missing X-Lodgix-Timestamp or X-Lodgix-Signature header' };
  }

  // Accept the value with or without the "sha256=" prefix, then validate before decoding
  const hex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return { valid: false, error: 'Malformed signature' };
  }

  // Signed message as bytes: timestamp header (latin1) + "." + raw body bytes
  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = createHmac('sha256', secret).update(message).digest();
  const provided = Buffer.from(hex.toLowerCase(), 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in replay window. Off by default: Hookdeck retries/replays keep the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^[0-9]+$/.test(timestamp)) {
      return { valid: false, error: 'Invalid timestamp' };
    }
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  return { valid: true };
}
