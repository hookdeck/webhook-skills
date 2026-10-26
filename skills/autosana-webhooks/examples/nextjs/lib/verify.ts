import crypto from 'crypto';

// Autosana: X-Autosana-Signature-256 = "sha256=" + hex(HMAC-SHA256(secret, rawBody))
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret || !signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  // Check the hex shape first: Buffer.from(x, 'hex') silently truncates invalid input
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
