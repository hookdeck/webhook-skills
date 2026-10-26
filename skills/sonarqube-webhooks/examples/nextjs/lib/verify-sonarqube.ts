import crypto from 'crypto';

/**
 * Verify a SonarQube webhook signature.
 *
 * SonarQube sends X-Sonar-Webhook-HMAC-SHA256 = bare lowercase hex of
 * HMAC-SHA256(secret, rawBody). Only the raw body is signed.
 */
export function verifySonarQubeSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  // Check shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!signature || !secret || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Equal-length hex strings as UTF-8 buffers, compared in constant time
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}
