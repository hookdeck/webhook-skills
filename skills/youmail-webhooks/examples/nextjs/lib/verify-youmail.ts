// Generated with: youmail-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type YouMailAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * YouMail does not sign payloads. When the webhook is created with auth "Bearer",
 * YouMail is expected to send `Authorization: Bearer <token>` (not printed in its docs). Compare the WHOLE header value,
 * including the "Bearer " prefix, with YOUMAIL_AUTHORIZATION. Don't strip or parse it.
 * A static credential authenticates the sender only: it does not cover the body and
 * gives no replay protection.
 */
export function verifyYouMailRequest(
  headers: Headers,
  config: YouMailAuthConfig = process.env
): boolean {
  const expected = config.YOUMAIL_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

export type YouMailEventType =
  | 'CALL_EVENT'
  | 'PHONE_INSIGHTS'
  | 'PROVIDER_TN_REPORT_STATUS'
  | 'WATCHLIST_SCORE_THRESHOLD';

/**
 * YouMail payloads have no envelope and no type field: each webhook is created for
 * one eventType. Prefer one URL per webhook; otherwise detect by top-level keys.
 */
export function classify(payload: Record<string, unknown>): YouMailEventType | null {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(payload, k);
  if (has('callEvents')) return 'CALL_EVENT';
  if (
    ['callAttestationSummaries', 'callCompletionSummaries', 'callLabelSummaries', 'callVolumeSummaries'].some(has)
  ) {
    return 'PHONE_INSIGHTS';
  }
  if (has('tnReportUuid')) return 'PROVIDER_TN_REPORT_STATUS';
  // WATCHLIST_PHONE_SCORE_THRESHOLD (deprecated, no longer emitted) shares this shape
  if (has('phoneNumber') && ['oldSpamScore', 'newSpamScore', 'newFraudScore', 'newUnlawfulScore'].some(has)) {
    return 'WATCHLIST_SCORE_THRESHOLD';
  }
  return null;
}
