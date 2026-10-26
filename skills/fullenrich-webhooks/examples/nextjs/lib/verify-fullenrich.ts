import crypto from 'crypto';

/**
 * Verify a FullEnrich webhook signature.
 *
 * FullEnrich sends X-Signature-SHA1 = lowercase hex(HMAC-SHA1(apiKey, rawBody)).
 * The key is your FullEnrich API key; there is no separate webhook secret.
 */
export function verifyFullEnrichSignature(
  rawBody: string,
  signature: string | null | undefined,
  apiKey: string | undefined
): boolean {
  // Check shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!signature || !apiKey || !/^[0-9a-f]{40}$/i.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha1', apiKey).update(rawBody, 'utf8').digest('hex');
  // Equal-length hex strings as UTF-8 buffers, compared in constant time
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}
