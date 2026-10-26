// Generated with: hitpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * HitPay event webhooks: Hitpay-Signature is the hex HMAC-SHA256 of the raw body,
 * keyed with that webhook endpoint's salt (Developers > Webhooks).
 * Legacy payment-request/charge callbacks (an "hmac" field in the payload, API-key
 * salt) use a different scheme and are not handled here.
 */
export function verifyHitpaySignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  salt: string | undefined = process.env.HITPAY_WEBHOOK_SALT
): boolean {
  if (!salt) return false; // never accept when unconfigured
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', salt).update(rawBody).digest('hex');
  // Both are 64 lowercase hex chars: equal-length buffers, so timingSafeEqual cannot throw.
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}
