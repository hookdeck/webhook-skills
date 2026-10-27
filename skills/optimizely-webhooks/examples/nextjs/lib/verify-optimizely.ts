import crypto from 'crypto';

/**
 * Verify X-Hub-Signature: sha1=<hex>, the hex HMAC-SHA1 of the raw body keyed
 * with the webhook's secret token. Only the body is signed (no timestamp).
 */
export function verifyOptimizelySignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!header || !secret) return false;
  const sig = header.startsWith('sha1=') ? header.slice(5) : header;
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-fA-F]{40}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}
