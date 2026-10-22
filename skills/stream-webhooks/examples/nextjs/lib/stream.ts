import crypto from 'crypto';
import zlib from 'zlib';

const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

/**
 * Stream signs the UNCOMPRESSED body. If Payload Compression
 * (enable_hook_payload_compression) is on, gunzip before verifying.
 * Turn compression off when using Hookdeck.
 */
export function decodeBody(rawBody: Buffer): Buffer {
  if (rawBody.length >= 2 && rawBody.subarray(0, 2).equals(GZIP_MAGIC)) {
    return zlib.gunzipSync(rawBody);
  }
  return rawBody;
}

/**
 * Verify a Stream webhook signature: hex HMAC-SHA256 of the raw body,
 * keyed with the app API secret (X-Signature header).
 */
export function verifyStreamWebhook(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  apiSecret: string | undefined
): boolean {
  if (!signature || !apiSecret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws if lengths differ
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
