// Generated with: axiom-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export interface AxiomAuthOptions {
  name?: string;
  secret?: string;
}

/**
 * Axiom does not sign requests. You add a secret header to the Custom webhook
 * notifier; the name is user-chosen (AXIOM_WEBHOOK_HEADER, default Authorization)
 * and the expected value is the exact, whole header value (AXIOM_WEBHOOK_SECRET),
 * including any "Bearer " prefix. Nothing is stripped or parsed.
 */
export function verifyAxiomRequest(
  headers: Headers,
  {
    name = process.env.AXIOM_WEBHOOK_HEADER || 'Authorization',
    secret = process.env.AXIOM_WEBHOOK_SECRET,
  }: AxiomAuthOptions = {}
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
