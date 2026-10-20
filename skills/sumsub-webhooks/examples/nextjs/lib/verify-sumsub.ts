// Generated with: sumsub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Sumsub announces the HMAC algorithm per webhook in x-payload-digest-alg.
// SHA256 is the default for new webhooks; older webhooks still send SHA1.
export const DIGEST_ALGORITHMS: Record<string, string> = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

/**
 * Verify a Sumsub webhook digest: hex HMAC of the raw body, keyed with the
 * webhook's secret key, using the algorithm named in x-payload-digest-alg.
 */
export function verifySumsubWebhook(
  rawBody: Buffer,
  digest: string | null,
  digestAlg: string | null,
  secret: string | undefined
): boolean {
  if (!digest || !secret) {
    return false;
  }

  // An absent alg header means SHA256; an unknown value is rejected
  const algorithm = DIGEST_ALGORITHMS[digestAlg || 'HMAC_SHA256_HEX'];
  if (!algorithm) {
    return false;
  }

  const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');

  // Timing-safe comparison (throws on length mismatch, so treat that as invalid)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
