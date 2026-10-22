import crypto from 'crypto';

// Yousign: X-Yousign-Signature-256 = "sha256=" + hex(HMAC-SHA256(secret, rawBody))
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}
