import crypto from 'crypto';

// Mailcoach: `Signature` = lowercase hex HMAC-SHA256 of the raw body, keyed with the
// webhook secret (UTF-8). No prefix, no timestamp.
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  // Validate the shape first: exactly 64 hex characters. Hex is case-insensitive.
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Both sides are 64 ASCII bytes, so timingSafeEqual cannot throw on length
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase(), 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}
