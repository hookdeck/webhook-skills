// Generated with: pubnub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const SCHEMA_PREFIX = 'pubnub.com/schemas/events/';

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
 * PubNub does not sign webhooks. You add a secret custom header to the Webhook
 * action; its name is yours to choose (PUBNUB_WEBHOOK_HEADER, default
 * 'Authorization') and the expected value is the WHOLE header value
 * (PUBNUB_WEBHOOK_SECRET), including any 'Bearer ' prefix you typed. Nothing
 * is stripped or parsed. Headers.get() is case-insensitive.
 */
export function verifyPubNubRequest(
  headers: Headers,
  secret: string | undefined = process.env.PUBNUB_WEBHOOK_SECRET,
  headerName: string = process.env.PUBNUB_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName);
  return Boolean(received) && safeEqual(received as string, secret);
}

/** 'pubnub.com/schemas/events/user.created?v=1.0.0' -> 'user.created' */
export function eventTypeFromSchema(dataSchema: unknown): string | null {
  if (typeof dataSchema !== 'string') return null;
  const withoutVersion = dataSchema.split('?')[0];
  return withoutVersion.startsWith(SCHEMA_PREFIX) ? withoutVersion.slice(SCHEMA_PREFIX.length) : null;
}
