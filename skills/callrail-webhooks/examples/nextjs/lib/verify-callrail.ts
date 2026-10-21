import crypto from 'crypto';

/**
 * Verify a CallRail webhook signature.
 *
 * CallRail sends `Signature` = base64(HMAC-SHA1(companySigningKey, rawBody)).
 * The key is used as a plain string (not hex-decoded).
 */
export function verifyCallRailSignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  signingKey: string | undefined
): boolean {
  if (!signature || !signingKey) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', signingKey)
    .update(rawBody)
    .digest('base64');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Optional replay check using the timestamp inside the body
 * (`timestamp`, or `submitted_at` for form submissions).
 * A tolerance of 0 disables the check.
 */
export function isTimestampFresh(
  payload: { timestamp?: string; submitted_at?: string },
  toleranceSeconds: number,
  nowMs: number = Date.now()
): boolean {
  if (!toleranceSeconds || toleranceSeconds <= 0) {
    return true;
  }
  const sentAt = Date.parse(payload.timestamp ?? payload.submitted_at ?? '');
  if (Number.isNaN(sentAt)) {
    return false;
  }
  return Math.abs(nowMs - sentAt) <= toleranceSeconds * 1000;
}

// Event names match the keys of the webhook integration `config` object
// (minus the `_webhook` suffix), e.g. `post_call_webhook` -> `post_call`.
export const KNOWN_EVENTS = [
  'pre_call',
  'answered_call',
  'post_call',
  'updated_call',
  'post_outbound_call',
  'updated_outbound_call',
  'sms_received',
  'sms_sent',
  'form_captured',
  'convert_assist_complete',
] as const;

export type CallRailPayload = Record<string, any>;

/**
 * CallRail does not put an event type in the body or a header. The event is
 * whichever webhook URL you registered, so either add `?callrail_event=<name>`
 * to the URL, or fall back to inferring it from the payload shape.
 */
export function classifyCallRailEvent(payload: CallRailPayload, hint?: string | null): string {
  if (hint && (KNOWN_EVENTS as readonly string[]).includes(hint)) {
    return hint;
  }
  if (Array.isArray(payload.changes)) {
    return payload.direction === 'outbound' ? 'updated_outbound_call' : 'updated_call';
  }
  if (payload.form_data) {
    return 'form_captured';
  }
  if (payload.answers && payload.last_interaction_resource_id) {
    return 'convert_assist_complete';
  }
  if (payload.source_number && payload.destination_number && 'content' in payload) {
    return 'agent' in payload ? 'sms_sent' : 'sms_received';
  }
  if (payload.call_type !== undefined || payload.customer_phone_number !== undefined) {
    // Pre-call, call routing complete and post-call share one call object
    return payload.direction === 'outbound' ? 'post_outbound_call' : 'call';
  }
  return 'unknown';
}
