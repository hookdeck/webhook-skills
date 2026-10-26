// Generated with: agentset-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX64 = /^[0-9a-fA-F]{64}$/;

/**
 * Agentset sends `agentset-signature`: the bare hex HMAC-SHA256 of the raw body, keyed with the
 * webhook's signing secret (UTF-8 bytes, as-is). Nothing else is signed, so there is no timestamp
 * or replay window to check. The format is validated before decoding.
 */
export function verifyAgentsetSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.AGENTSET_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string' || !HEX64.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: validated above
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
