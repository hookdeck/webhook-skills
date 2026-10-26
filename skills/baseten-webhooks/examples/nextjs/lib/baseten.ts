import crypto from 'crypto';

// X-BASETEN-SIGNATURE: v1=<hex>. HMAC-SHA256 of the raw body bytes, keyed with
// the secret's UTF-8 bytes. Nothing else is signed, so there is no timestamp
// window. During rotation the header may hold several comma-separated values.
export function verifyBasetenSignature(
  rawBody: Buffer,
  header: string | null,
  secret: string | undefined
): boolean {
  if (!header || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return header.split(',').some((part) => {
    const sig = part.trim().replace(/^v1=/, '');
    // Validate length and alphabet before decoding: Buffer.from(.., 'hex')
    // silently drops invalid characters.
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
  });
}
