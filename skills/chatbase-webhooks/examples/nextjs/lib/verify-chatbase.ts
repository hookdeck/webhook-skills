import crypto from 'crypto';

// HIPAA deliveries older than this are rejected as replays
export const HIPAA_MAX_AGE_SECONDS = 300;

/** Timing-safe comparison that returns false instead of throwing on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Chatbase event webhook signature.
 *
 * x-chatbase-signature = hex(HMAC-SHA1(secret, rawBody)) - no prefix, no timestamp.
 */
export function verifyChatbaseSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex');
  return safeEqual(signature, expected);
}

export type HipaaVerifyResult =
  | { ok: true }
  | { ok: false; error: 'missing_headers' | 'stale_timestamp' | 'invalid_signature' };

/**
 * Verify a Chatbase HIPAA conversation webhook signature.
 *
 * X-Chatbase-Signature = "v1=" + hex(HMAC-SHA256(secret, timestamp + "." + rawBody))
 */
export function verifyChatbaseHipaaSignature(
  rawBody: string,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined,
  nowSeconds: number = Date.now() / 1000
): HipaaVerifyResult {
  if (!signature || !timestamp) return { ok: false, error: 'missing_headers' };
  if (!secret) return { ok: false, error: 'invalid_signature' };

  // Replay protection: the timestamp is signed, but only checking it makes that useful
  const age = Math.abs(nowSeconds - Number(timestamp));
  if (!/^\d+$/.test(timestamp) || !Number.isFinite(age) || age > HIPAA_MAX_AGE_SECONDS) {
    return { ok: false, error: 'stale_timestamp' };
  }

  const expected =
    'v1=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');

  // Compare the full string, v1= prefix included
  return safeEqual(signature, expected) ? { ok: true } : { ok: false, error: 'invalid_signature' };
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

export type ChatbaseHipaaEvent = {
  deliveryId: string;
  event: string;
  test?: boolean;
  deletedAt?: string;
  deletionReason?: 'idle_24h' | 'max_age_7d' | string;
  conversation?: {
    id: string;
    chatbotId: string;
    accountId?: string;
    messages?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
};
