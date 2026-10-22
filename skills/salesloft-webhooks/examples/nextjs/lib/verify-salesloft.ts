import crypto from 'crypto';

/**
 * Verify a Salesloft webhook signature.
 *
 * Salesloft sends x-salesloft-signature = hex(HMAC-SHA1(callback_token, rawBody)).
 * There is no timestamp and no prefix.
 */
export function verifySalesloftSignature(
  rawBody: string,
  signature: string | null | undefined,
  callbackToken: string | undefined
): boolean {
  if (!signature || !callbackToken) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', callbackToken)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
