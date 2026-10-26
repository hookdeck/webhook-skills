// Generated with: tutorcruncher-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Webhook-Signature is the bare lowercase hex HMAC-SHA256 of the raw body, keyed with the
 * integration's private API key (UTF-8 bytes, used as-is). No prefix, id or timestamp.
 * Not Standard Webhooks, despite the header name.
 */
export function verifyTutorCruncherSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  secret: string | undefined = process.env.TUTORCRUNCHER_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature.toLowerCase(), 'utf8'); // hex is case-insensitive
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}
