import crypto from 'crypto';

/**
 * Verify the X-SigSci-Signature header: hex HMAC-SHA256 of the raw JSON body,
 * keyed with the integration's signing key (raw string). No timestamp or prefix.
 */
export function verifySignalSciencesWebhook(
  rawBody: string,
  signatureHeader: string | null,
  signingKey: string | undefined
): boolean {
  if (!signatureHeader || !signingKey) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch, which means invalid
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
