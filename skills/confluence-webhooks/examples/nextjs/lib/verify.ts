import crypto from 'crypto';

// X-Hub-Signature carries an HMAC-SHA256 hex digest of the raw body,
// formatted as "sha256=<hex>" (prefix optional).
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  let sig = signatureHeader.trim().toLowerCase();
  const eq = sig.indexOf('=');
  if (eq !== -1) {
    if (sig.slice(0, eq) !== 'sha256') return false;
    sig = sig.slice(eq + 1);
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}
