import crypto from 'crypto';

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Campfire webhook delivery.
 *
 * Signed message (bytes): `{Campfire-Webhook-Request-Timestamp}:{raw body}`.
 * HMAC-SHA256 keyed with the signing secret as UTF-8, bare hex digest in
 * `Campfire-Webhook-Signature-v1`. The separator is a colon, not a dot.
 *
 * @param rawBody          Raw request bytes (from request.arrayBuffer())
 * @param timestamp        Campfire-Webhook-Request-Timestamp, exactly as received
 * @param signature        Campfire-Webhook-Signature-v1 header value
 * @param secret           Webhook signing secret (`token`)
 * @param toleranceSeconds Optional max age; 0 (default) = no check
 */
export function verifyCampfireSignature(
  rawBody: Buffer,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined,
  toleranceSeconds = 0
): boolean {
  if (!secret || !timestamp || !signature) return false;

  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_DIGEST.test(signature)) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(':'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated above: 32 bytes

  return crypto.timingSafeEqual(expected, received);
}
