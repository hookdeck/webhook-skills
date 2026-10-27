// Generated with: spherepay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// SpherePay signs every delivery (this is NOT Standard Webhooks: do not use the standardwebhooks
// or svix libraries):
//   Sphere-Signature = hex( HMAC-SHA256( secret, "{Sphere-Timestamp}.{raw body}" ) )
// The secret is the endpoint's whole whsec_... string, used as a plain UTF-8 key (not decoded).
// https://docs.spherepay.co/concepts/webhooks/verifying-signatures

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

// Optional replay window in seconds. Off by default (0): Hookdeck retries and replays resend the
// original Sphere-Timestamp, so a window would reject legitimate redeliveries. Set
// SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}

// Signed message as bytes: timestamp header (latin1, exactly as received) + "." + raw body bytes
export function computeSignature(rawBody: Buffer, timestamp: string, secret: string): string {
  const signed = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  return crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest('hex');
}

export function verifySpherePay(rawBody: Buffer, headers: Headers, secret: string): boolean {
  if (!secret) return false;

  const signature = headers.get('sphere-signature');
  const timestamp = headers.get('sphere-timestamp');
  if (!signature || !timestamp) return false;

  // The whole header is one bare hex digest: validate it before decoding (Buffer.from(x, 'hex')
  // silently drops bad characters). Hex is case-insensitive.
  if (!HEX_SHA256.test(signature)) return false;

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  const expected = Buffer.from(computeSignature(rawBody, timestamp, secret), 'hex');
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
