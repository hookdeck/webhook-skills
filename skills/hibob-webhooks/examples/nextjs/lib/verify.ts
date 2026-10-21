import crypto from 'crypto';

/**
 * Verify the Bob-Signature header: base64(HMAC-SHA512(rawBody, secret)).
 * The secret is the raw string shown in the Bob webhook configuration.
 */
export function verifyBobSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Bob sends "Ping test" (plain text) or {"text":"Ping test"} when a webhook is added
export function isPing(rawBody: string): boolean {
  const text = rawBody.trim();
  if (text === 'Ping test') return true;
  try {
    return JSON.parse(text)?.text === 'Ping test';
  } catch {
    return false;
  }
}
