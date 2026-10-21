import crypto from 'crypto';

/**
 * Verify a Rutter webhook signature.
 * X-Rutter-Signature(s) = "sha256=" + base64(HMAC-SHA256(rawBody, clientSecret)).
 * X-Rutter-Signatures lists every active signature (two during secret rotation),
 * so accept if any computed signature matches any received entry.
 */
export function verifyRutterWebhook(
  rawBody: string | Buffer,
  signaturesHeader: string | null | undefined,
  secrets: Array<string | undefined>
): boolean {
  if (!signaturesHeader) return false;
  const received = signaturesHeader.split(',').map((s) => s.trim());

  return secrets.filter((s): s is string => !!s).some((secret) => {
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

    return received.some((sig) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false; // different lengths = invalid
      }
    });
  });
}
