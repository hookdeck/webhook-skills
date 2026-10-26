import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Remote webhook.
 *
 * signature = lowercase hex HMAC-SHA256(secret, raw_body + ":" + X-Remote-Timestamp)
 * The signed message is built as bytes: the raw body as received, a literal ":", and the
 * timestamp header exactly as sent (latin1, never trimmed or parsed).
 */
export function verifyRemoteSignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined = process.env.REMOTE_WEBHOOK_SECRET,
  toleranceSeconds: number = Number(process.env.REMOTE_WEBHOOK_TOLERANCE_SECONDS) || 0,
): boolean {
  if (!secret || !signature || !timestamp) return false;

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_SHA256.test(signature)) return false;

  const message = Buffer.concat([rawBody, Buffer.from(':', 'utf8'), Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // 32 bytes, validated above
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return false;

  // Opt-in only: Hookdeck retries and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceSeconds * 1000) return false;
  }
  return true;
}
