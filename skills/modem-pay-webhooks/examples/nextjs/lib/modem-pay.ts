// Generated with: modem-pay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// Modem Pay signs every delivery:
//   x-modem-signature: <hex>
// <hex> = HMAC-SHA512 of the request body, keyed with the webhook secret (Developers > Webhooks in
// the Modem Pay dashboard) used as-is. There is no timestamp and no prefix such as "sha512=".
// https://docs.modempay.com/documentation/core/webhooks#webhook-security-and-signature-validation
//
// Hash the RAW body bytes. Modem Pay's own snippets hash JSON.stringify(req.body), which only works
// while re-serialising reproduces the exact bytes that were sent; the raw body always does.
export function verifyModemPay(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!secret || typeof signatureHeader !== 'string') return false;
  const signature = signatureHeader.trim();
  // 128 hex characters (case-insensitive) before decoding or comparing anything
  if (!/^[0-9a-fA-F]{128}$/.test(signature)) return false;
  const expected = Buffer.from(crypto.createHmac('sha512', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signature.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
