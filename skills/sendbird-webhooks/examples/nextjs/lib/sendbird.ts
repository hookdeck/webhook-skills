import crypto from 'crypto';

/**
 * Verify the x-sendbird-signature header.
 * Sendbird sends the hex HMAC-SHA256 of the raw request body, keyed with the
 * application's MASTER API token (secondary API tokens do not work).
 */
export function verifySendbirdWebhook(
  rawBody: string,
  signatureHeader: string | null,
  apiToken: string | undefined
): boolean {
  if (!signatureHeader || !apiToken) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', apiToken)
    .update(rawBody)
    .digest('hex');

  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch, so check first
  return (
    received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf)
  );
}
