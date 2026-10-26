// Generated with: strapi-webhooks skill
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
 * Strapi does not sign webhooks. Authenticate the request with a header you add in Strapi
 * (per webhook in the admin panel, or webhooks.defaultHeaders in config/server). The header
 * name is yours to choose; the expected value is compared in full, so a "Bearer " prefix
 * typed in Strapi must be part of STRAPI_WEBHOOK_SECRET. Nothing is stripped or parsed.
 */
export function verifyStrapiRequest(
  headers: Headers,
  secret: string | undefined = process.env.STRAPI_WEBHOOK_SECRET,
  headerName: string = process.env.STRAPI_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}
