import crypto from 'crypto';

/**
 * Verify a Veriff webhook signature.
 *
 * Veriff sends X-HMAC-SIGNATURE: lowercase hex HMAC-SHA256 of the RAW request body,
 * keyed with the integration's shared secret key (used as a plain string).
 */
export function verifyVeriffSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths throw, which means the signature is invalid
  }
}

export const DECISION_STATUSES = [
  'approved',
  'declined',
  'resubmission_requested',
  'review',
  'expired',
  'abandoned',
] as const;

export const EVENT_ACTIONS = [
  'started',
  'submitted',
  'waiting_complete',
  'waiting_continued',
  'flow_finished',
  'flow_cancelled',
  'document_type_other_selected',
] as const;
