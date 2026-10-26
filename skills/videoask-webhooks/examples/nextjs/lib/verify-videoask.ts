// Generated with: videoask-webhooks skill
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
 * VideoAsk does not sign payloads. Authenticate with a header you add in the Connect
 * tab ("Add a secret": header name and value) or through the API
 * (PUT /forms/{form_id}/webhooks/{tag}, "headers" object). The header name is
 * yours; the value is compared whole (no Bearer parsing). This authenticates the
 * sender only: no body integrity and no replay protection, so use HTTPS.
 */
export function verifyVideoAskRequest(
  headers: Headers,
  options: { headerName?: string; secret?: string } = {}
): boolean {
  const headerName = options.headerName ?? (process.env.VIDEOASK_WEBHOOK_HEADER || 'secret');
  const secret = options.secret ?? process.env.VIDEOASK_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
