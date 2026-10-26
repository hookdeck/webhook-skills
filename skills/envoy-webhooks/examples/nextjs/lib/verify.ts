// Generated with: envoy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

/**
 * ENVOY WEBHOOK VERIFICATION
 *
 * X-Envoy-Signature is the base64 HMAC-SHA256 of the raw request body, keyed
 * with your Envoy app's client secret. There is no timestamp in the signed
 * content. (Same algorithm as the official @envoy/envoy-integrations-sdk
 * EnvoySignatureVerifier.)
 */
export function verifyEnvoySignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
