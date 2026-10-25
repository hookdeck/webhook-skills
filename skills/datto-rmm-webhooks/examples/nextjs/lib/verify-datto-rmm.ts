// Generated with: datto-rmm-webhooks skill
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
 * Datto RMM does not sign payloads. Authenticate with the secret header you added to the
 * Global Webhook (Add Header). The name is user-chosen, so it comes from
 * DATTO_RMM_WEBHOOK_HEADER; the WHOLE header value (including any "Bearer " prefix you
 * typed) is compared with DATTO_RMM_WEBHOOK_SECRET. A static credential authenticates the
 * sender, not the body, and gives no replay protection.
 */
export function verifyDattoRmmRequest(
  headers: Headers,
  options: { headerName?: string; secret?: string } = {}
): boolean {
  const headerName = options.headerName ?? (process.env.DATTO_RMM_WEBHOOK_HEADER || 'Authorization');
  const secret = options.secret ?? process.env.DATTO_RMM_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
