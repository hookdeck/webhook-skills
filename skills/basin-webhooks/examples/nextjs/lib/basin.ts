// Generated with: basin-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a Basin webhook signature.
 *
 * Basin sends `X-Basin-Signature: sha256=<hex>` where <hex> is the HMAC-SHA256 of the
 * raw request body, keyed with the webhook signing secret (Growth plan and above).
 */
export function verifyBasinSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  // Check hex shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

/** Parse the submission: JSON, data-wrapped JSON, or form-urlencoded. */
export function parseSubmission(
  rawBody: string,
  contentType: string | null
): Record<string, unknown> {
  let payload: Record<string, unknown>;
  if (/json/i.test(contentType ?? '') || rawBody.trimStart().startsWith('{')) {
    payload = JSON.parse(rawBody);
  } else {
    payload = Object.fromEntries(new URLSearchParams(rawBody));
  }
  if (typeof payload.data === 'object' && payload.data !== null) {
    return payload.data as Record<string, unknown>;
  }
  if (typeof payload.data === 'string') {
    return Object.fromEntries(new URLSearchParams(payload.data));
  }
  return payload;
}
