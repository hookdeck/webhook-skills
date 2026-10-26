// Generated with: meetgeek-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a MeetGeek webhook signature.
 *
 * MeetGeek sends `X-MG-Signature: <hex>`: the lowercase hex HMAC-SHA256 of the exact raw
 * request body, keyed with the UTF-8 bytes of the configured secret. Nothing else is signed.
 */
export function verifyMeetGeekSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  // Validate the hex shape first (exactly 64 hex chars); no Buffer.from(x, 'hex') on raw input
  if (!signatureHeader || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase()),
    Buffer.from(expected)
  );
}
