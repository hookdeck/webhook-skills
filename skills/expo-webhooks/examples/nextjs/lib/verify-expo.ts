import crypto from 'crypto';

/**
 * Verify an Expo EAS webhook signature.
 *
 * EAS sends expo-signature = "sha1=" + hex(HMAC-SHA1(secret, rawBody)).
 */
export function verifyExpoSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected =
    'sha1=' + crypto.createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

export type ExpoPayload = {
  id?: string;
  platform?: 'ios' | 'android';
  status?: 'finished' | 'errored' | 'canceled';
  buildDetailsPageUrl?: string;
  artifacts?: { buildUrl?: string };
  metadata?: Record<string, unknown>;
  error?: { message?: string; errorCode?: string };
  submissionDetailsPageUrl?: string;
  submissionInfo?: { error?: { message?: string; errorCode?: string }; logsUrl?: string };
  archiveUrl?: string;
};

/**
 * EAS payloads have no event-type field: BUILD vs SUBMIT is set on the webhook
 * itself, so tell them apart by their fields.
 */
export function classifyPayload(payload: ExpoPayload): 'BUILD' | 'SUBMIT' | 'UNKNOWN' {
  if (payload.submissionDetailsPageUrl || payload.submissionInfo || payload.archiveUrl) {
    return 'SUBMIT';
  }
  if (payload.buildDetailsPageUrl || payload.artifacts || payload.metadata) {
    return 'BUILD';
  }
  return 'UNKNOWN';
}
