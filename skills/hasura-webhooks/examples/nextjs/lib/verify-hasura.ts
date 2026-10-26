// Generated with: hasura-webhooks skill
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

/**
 * Hasura Event Triggers are not signed. You add a secret header to the trigger
 * (Advanced settings > Headers); its name is yours to choose. We compare the WHOLE
 * header value with HASURA_WEBHOOK_SECRET (no Bearer parsing). This authenticates the
 * sender only: there is no body integrity and no replay protection.
 */
export function verifyHasuraRequest(
  headers: Headers,
  options: { name?: string; secret?: string } = {}
): boolean {
  const name = options.name ?? (process.env.HASURA_WEBHOOK_HEADER || 'Authorization');
  const secret = options.secret ?? process.env.HASURA_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
