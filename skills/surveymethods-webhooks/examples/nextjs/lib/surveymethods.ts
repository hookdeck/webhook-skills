// Generated with: surveymethods-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a SurveyMethods webhook signature.
 *
 * SurveyMethods sends `X-SurveyMethods-Signature: sha256=<hex>` where <hex> is the HMAC-SHA256
 * of the raw request body keyed with the webhook's signing secret. The bare digest is accepted too.
 */
export function verifySurveyMethodsSignature(
  rawBody: Buffer | Uint8Array,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  let received = signatureHeader.trim();
  if (received.startsWith('sha256=')) received = received.slice('sha256='.length);
  // Check hex shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
