import crypto from 'crypto';

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

// Signed message, as bytes: <X-GS-TIMESTAMP value> 0x0A <raw body bytes>
// The separator is a real LF (0x0A), not the two characters backslash and n.
export function buildSignedContent(timestamp: string, rawBody: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(timestamp, 'latin1'), // header value exactly as received
    Buffer.from('\n', 'utf8'),
    rawBody // raw bytes, never decoded and re-encoded
  ]);
}

export function verifyGreenshadesSignature(
  rawBody: Buffer,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!timestamp || !signature || !secret) return false;
  // Whole header value is one bare 64-char hex digest (case-insensitive)
  if (!SHA256_HEX.test(signature)) return false;

  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8')) // key used as-is, not decoded
    .update(buildSignedContent(timestamp, rawBody))
    .digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // format validated above
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Opt-in only. The X-GS-TIMESTAMP format is not documented, so it is parsed
// (epoch seconds, epoch milliseconds or an ISO date) only when a tolerance is set.
export function timestampWithinTolerance(
  timestamp: string,
  toleranceSeconds: number,
  nowMs: number = Date.now()
): boolean {
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(timestamp)) {
    const n = Number(timestamp);
    ms = n > 1e12 ? n : n * 1000;
  } else {
    ms = Date.parse(timestamp);
  }
  if (!Number.isFinite(ms)) return false;
  return Math.abs(nowMs - ms) <= toleranceSeconds * 1000;
}
