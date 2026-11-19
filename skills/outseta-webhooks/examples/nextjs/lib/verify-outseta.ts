// Generated with: outseta-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Outseta signs webhooks once you add a Webhook Signature Key:
//   x-hub-signature-256: sha256=<hex HMAC-SHA256 of the raw body>
// The key is 32 bytes you generate, written as HEX (openssl rand -hex 32):
// hex-decode it to get the HMAC key. (Decoding it as base64 gives 48 wrong bytes.)

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

export function verifyOutsetaWebhook(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  signatureKey: string | undefined
): boolean {
  const key = decodeHexSecret(signatureKey);
  if (!key || !signature) return false;
  const match = /^sha256=((?:[0-9a-fA-F]{2})+)$/.exec(signature.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return bytesEqual(Buffer.from(match[1], 'hex'), expected);
}

/**
 * Each Outseta notification posts the record it's about (for example the
 * Person for "Person Login"). Outseta's signature article doesn't show a
 * payload, so this example only reads Uid if the record has one.
 */
export function handleEvent(payload: unknown, _rawBody?: Buffer): { received: true } {
  const uid = payload && typeof payload === 'object' ? (payload as { Uid?: string }).Uid : undefined;
  console.log(`Outseta notification for record ${uid}`);
  return { received: true };
}
