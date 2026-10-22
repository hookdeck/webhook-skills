// Generated with: toggl-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a Toggl Track webhook signature.
 *
 * Toggl sends `X-Webhook-Signature-256: sha256=<hex>` where <hex> is the
 * HMAC-SHA256 of the full, unparsed request body keyed with the subscription secret.
 */
export function verifyTogglWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}
