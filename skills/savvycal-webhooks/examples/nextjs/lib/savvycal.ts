import crypto from 'crypto';

/**
 * Verify a SavvyCal webhook signature.
 *
 * SavvyCal sends an `x-savvycal-signature` header containing the HMAC-SHA256 of
 * the raw request body, keyed with the webhook's secret. The docs' header example
 * is `sha256=<UPPERCASE hex>`, while their Elixir sample compares the bare
 * uppercase digest, so accept both: strip an optional `sha256=` prefix and
 * compare the hex case-insensitively.
 */
export function verifySavvyCalSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!header || !secret) return false;

  const received = header.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Timing-safe comparison (both are 32 bytes once decoded)
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}
