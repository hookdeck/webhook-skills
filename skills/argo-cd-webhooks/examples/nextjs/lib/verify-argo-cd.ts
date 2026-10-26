// Generated with: argo-cd-webhooks skill
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
 * Argo CD does not sign webhooks. The notifications engine sends every header
 * configured on the webhook service, so authenticate with a header you add
 * (service.webhook.<name>.headers). The header name is yours to choose; the whole
 * header value is compared exactly (a "Bearer " prefix is not parsed or stripped).
 */
export function verifyArgoCdRequest(
  headers: Headers,
  secret: string | undefined = process.env.ARGO_CD_WEBHOOK_SECRET,
  headerName: string = process.env.ARGO_CD_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
