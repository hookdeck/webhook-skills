import crypto from 'crypto';

const SIGNATURE_PREFIX = 'sha256=';

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify a Holded webhook signature.
 *
 * Header:    x-holded-webhook-signature: sha256=<64 hex chars>
 * Signed:    the raw request body only (x-holded-webhook-date is NOT signed)
 * Algorithm: HMAC-SHA256, hex digest, keyed with the whole secret string as
 *            UTF-8, including the whsec_ prefix (this is not Standard Webhooks)
 */
export function verifyHoldedSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  secret: string
): VerifyResult {
  if (!header) {
    return { valid: false, error: 'Missing x-holded-webhook-signature header' };
  }
  if (!header.startsWith(SIGNATURE_PREFIX)) {
    return { valid: false, error: 'Signature must start with sha256=' };
  }

  const received = header.slice(SIGNATURE_PREFIX.length);
  // Buffer.from(x, 'hex') silently truncates at the first invalid character,
  // so check the shape before decoding.
  if (!/^[0-9a-f]{64}$/i.test(received)) {
    return { valid: false, error: 'Malformed signature' };
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const valid = crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
  return valid ? { valid: true } : { valid: false, error: 'Invalid signature' };
}
