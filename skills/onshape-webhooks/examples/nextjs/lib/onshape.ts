import crypto from 'crypto';

// Standard padded base64 of a 32-byte digest: 43 characters plus "="
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify an Onshape webhook signature.
 *
 * Onshape sends X-onshape-webhook-signature-primary =
 * base64(HMAC-SHA256(key, "<X-onshape-webhook-timestamp value>.<raw body>")).
 * The key is the company's primary signature key, used as a UTF-8 string.
 */
export function verifyOnshapeSignature(
  rawBody: Buffer,
  timestamp: string | null | undefined,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!timestamp || !signature || !secret) {
    return false;
  }
  // Validate the format before comparing: exact length and alphabet
  if (!SIGNATURE_FORMAT.test(signature)) {
    return false;
  }

  // Signed message as bytes: header (latin1) + "." + raw body bytes
  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest('base64');

  const received = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}

/**
 * Optional replay window. Off unless toleranceSeconds > 0. Accepts epoch
 * seconds, epoch milliseconds or a date string; anything unparsable fails.
 */
export function isTimestampFresh(
  timestamp: string,
  toleranceSeconds: number | undefined,
  now: number = Date.now()
): boolean {
  if (!toleranceSeconds || toleranceSeconds <= 0) {
    return true;
  }
  let sentAt: number;
  if (/^\d+(\.\d+)?$/.test(timestamp)) {
    const n = Number(timestamp);
    sentAt = n < 1e11 ? n * 1000 : n;
  } else {
    sentAt = Date.parse(timestamp);
  }
  if (Number.isNaN(sentAt)) {
    return false;
  }
  return Math.abs(now - sentAt) <= toleranceSeconds * 1000;
}
