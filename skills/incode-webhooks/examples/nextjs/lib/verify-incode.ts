// Generated with: incode-webhooks skill
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
 * Incode does not sign payloads. You add a custom header in Dashboard >
 * Configuration > Webhooks and Incode sends it on every webhook. The header name is
 * yours to choose, so it comes from INCODE_WEBHOOK_HEADER (default Authorization).
 * The WHOLE header value is compared with INCODE_WEBHOOK_SECRET: no prefix is
 * stripped or parsed (a "Bearer " you typed into the value is part of the value).
 */
export function verifyIncodeRequest(
  headers: Headers,
  secret: string | undefined = process.env.INCODE_WEBHOOK_SECRET,
  headerName: string = process.env.INCODE_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return received !== null && received !== '' && safeEqual(received, secret);
}

export interface IncodePayload {
  event_type?: string;
  eventType?: string;
  onboardingStatus?: string;
  interviewId?: string;
  interviewIds?: string[];
  identityId?: string;
  failureReasons?: string[];
  [key: string]: unknown;
}

// Each webhook kind carries its name in a different field.
export function eventName(payload: IncodePayload): string | undefined {
  return payload.event_type || payload.eventType || payload.onboardingStatus;
}
