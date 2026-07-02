// Generated with: recurly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'node:crypto';

/** Constant-time string comparison that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the `recurly-signature` header for a JSON webhook.
 *
 * Header format: "<timestamp>,<sig1>,<sig2>,..." where timestamp is Unix time in
 * milliseconds and each sig is a hex HMAC-SHA256 signature. Multiple signatures
 * appear during a 24h key rotation; the notification is valid if ANY matches.
 *
 * Signed message: `${timestamp}.${rawBody}` over the RAW, unparsed body.
 */
export function verifyRecurlySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

  const [timestamp, ...signatures] = signatureHeader.split(',');
  if (!timestamp || signatures.length === 0) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const expectedBuf = Buffer.from(expected);

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig.trim());
    if (sigBuf.length !== expectedBuf.length) return false;
    try {
      return crypto.timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

/**
 * Verify HTTP Basic Auth. Only enforced when credentials are configured in the
 * environment (i.e. you also set them on the endpoint in Recurly).
 */
export function verifyBasicAuth(
  authHeader: string | null,
  user: string | undefined,
  password: string | undefined
): boolean {
  if (!user && !password) return true; // not configured → skip
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  const gotUser = decoded.slice(0, sep);
  const gotPass = decoded.slice(sep + 1);
  return safeEqual(gotUser, user || '') && safeEqual(gotPass, password || '');
}
