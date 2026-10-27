import crypto from 'crypto';

/**
 * Verify a Chili Piper webhook signature.
 *
 * Chili Piper sends `X-Chili-Signature` = lowercase hex HMAC-SHA256 of
 * `{X-Chili-Timestamp}.{raw body}`, keyed with the tenant's signing secret
 * (UTF-8 bytes, used as-is).
 */
export function verifyChiliPiperSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !timestamp || !secret) {
    return false;
  }

  // Validate the format before decoding: Buffer.from(x, 'hex') silently
  // drops invalid characters.
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) {
    return false;
  }

  // Signed message built as bytes: timestamp header (latin1) + "." + raw body
  const signed = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();

  // Both are 32 bytes, so timingSafeEqual cannot throw on length
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

/**
 * Optional replay check on `X-Chili-Timestamp` (Unix seconds).
 * A tolerance of 0 (default) disables the check.
 */
export function isTimestampFresh(
  timestamp: string,
  toleranceSeconds: number,
  nowMs: number = Date.now()
): boolean {
  if (!toleranceSeconds || toleranceSeconds <= 0) {
    return true;
  }
  if (!/^\d+$/.test(timestamp)) {
    return false;
  }
  return Math.abs(nowMs / 1000 - Number(timestamp)) <= toleranceSeconds;
}
