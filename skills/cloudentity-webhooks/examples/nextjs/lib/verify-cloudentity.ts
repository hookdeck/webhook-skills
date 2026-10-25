// Generated with: cloudentity-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the key's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Cloudentity (SecureAuth) does not sign payloads. Every webhook request carries
 * the Webhook API Key as plain text in the X-API-Key header. Compare the WHOLE
 * header value with the key you stored. This authenticates the sender only; it
 * says nothing about the body and gives no replay protection.
 */
export function verifyCloudentityRequest(
  headers: Headers,
  apiKey: string | undefined = process.env.CLOUDENTITY_WEBHOOK_API_KEY
): boolean {
  if (!apiKey) return false; // never accept when unconfigured
  const received = headers.get('x-api-key');
  return Boolean(received) && safeEqual(received as string, apiKey);
}
