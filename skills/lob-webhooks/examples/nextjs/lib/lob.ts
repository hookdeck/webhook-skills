import crypto from 'crypto';

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Lob webhook signature.
 *
 * Lob-Signature = lowercase hex HMAC-SHA256(secret, `${Lob-Signature-Timestamp}.${raw body}`)
 * The signed message is built as BYTES: the timestamp header exactly as received (latin1),
 * a literal ".", then the raw body bytes. Never decode and re-encode the body.
 */
export function verifyLobSignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !signature || !timestamp) return false;

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_DIGEST.test(signature)) return false;

  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  // Hex is case-insensitive: decode both sides to bytes, then compare in constant time.
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/**
 * Optional replay protection (Lob's step 4). Off unless a tolerance > 0 is configured.
 * Hookdeck retries and replays re-send the ORIGINAL timestamp, so a fixed window would reject
 * legitimate retries - leave it off when Lob delivers through Hookdeck.
 * Lob does not document the timestamp unit, so a ~10-digit value is read as seconds and a
 * ~13-digit value as milliseconds.
 */
export function isTimestampFresh(timestamp: string | null, toleranceSeconds: number): boolean {
  if (!(toleranceSeconds > 0)) return true;
  const value = Number(timestamp);
  if (!timestamp || !Number.isFinite(value)) return false;
  const timestampMs = Math.abs(value) < 1e11 ? value * 1000 : value;
  return Math.abs(Date.now() - timestampMs) <= toleranceSeconds * 1000;
}
