import crypto from 'crypto';

// x-chatbase-signature is 40 hex characters: hex(HMAC-SHA1(secret, rawBody))
const SIGNATURE_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Verify a Chatbase Action webhook signature.
 *
 * x-chatbase-signature = hex(HMAC-SHA1(secret, rawBody)) - no prefix, no timestamp.
 * The value must be exactly 40 hex characters. Hex is compared case-insensitively,
 * in constant time.
 */
export function verifyChatbaseSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret || !SIGNATURE_PATTERN.test(signature)) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature.toLowerCase(), 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  return received.length === computed.length && crypto.timingSafeEqual(received, computed);
}

export type EventKind =
  | 'leads.submit'
  | 'phone_call.summary'
  | 'custom_form.submit'
  | 'collect_data.submit'
  | 'unknown';

/**
 * Event types with an Action name in them look like
 * "{action name}_custom_form.submit" and "{action name}_collect_data.submit".
 */
export function parseEventType(eventType: unknown): { kind: EventKind; actionName?: string } {
  if (eventType === 'leads.submit' || eventType === 'phone_call.summary') {
    return { kind: eventType };
  }
  for (const suffix of ['_custom_form.submit', '_collect_data.submit'] as const) {
    if (typeof eventType === 'string' && eventType.endsWith(suffix) && eventType.length > suffix.length) {
      return {
        kind: suffix.slice(1) as EventKind,
        actionName: eventType.slice(0, -suffix.length),
      };
    }
  }
  return { kind: 'unknown' };
}

export type ChatbaseEvent = {
  eventType: string;
  chatbotId: string;
  payload: {
    conversationId?: string;
    // leads.submit
    customerEmail?: string;
    customerName?: string;
    customerPhone?: string;
    customFields?: Record<string, unknown>;
    // {action name}_custom_form.submit
    data?: Record<string, unknown>;
    error?: string | null;
    // phone_call.summary
    callSummary?: string;
    duration?: number;
    callerNumber?: string;
    calledNumber?: string;
  };
};
