// Generated with: fountain-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Fountain signs the raw request body: X-OBIQ-SIGNATURE-V2 = hex(HMAC-SHA256(key = your
 * Fountain Hire private API token, message = body)). No prefix, no timestamp.
 * Accounts switched to applicant-ID signing are not supported.
 */
export function verifyFountainSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined = process.env.FOUNTAIN_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  // Validate length and alphabet first: Buffer.from(x, 'hex') silently drops bad characters.
  if (typeof signatureHeader !== 'string' || !HEX_SHA256.test(signatureHeader)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest(); // 32 bytes
  const received = Buffer.from(signatureHeader, 'hex'); // hex is case-insensitive; 32 bytes
  return crypto.timingSafeEqual(received, expected);
}

/**
 * Fountain deliveries have no event-name field or header, so dispatch on the payload shape:
 * screening events are { applicant: {...} }, Post-Hire events are the flat worker object.
 */
export function classify(payload: Record<string, unknown>): 'applicant' | 'worker' | null {
  if (payload.applicant && typeof payload.applicant === 'object') return 'applicant';
  if (typeof payload.id === 'string' && 'is_active' in payload) return 'worker';
  return null;
}
