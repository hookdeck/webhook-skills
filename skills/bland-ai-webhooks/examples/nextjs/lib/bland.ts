// Generated with: bland-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Bland signs deliveries with HMAC-SHA256:
//   X-Webhook-Signature: hex( HMAC-SHA256(signing secret, request body) )
// There is no timestamp or message id. Bland's docs sign JSON.stringify(req.body);
// the prose says the request body. Signing the raw bytes follows the prose; the two
// match only if Bland sends compact JSON that JSON.stringify reproduces exactly.
// ---------------------------------------------------------------------------

/**
 * Verify X-Webhook-Signature against the raw request body.
 */
export function verifyBlandSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const received = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}
