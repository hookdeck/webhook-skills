// Generated with: fanvue-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

export const TOLERANCE_SECONDS = 300;
export const PROBE_TYPE = 'fanvue.webhook.verification';

export type VerifyResult = { valid: true } | { valid: false; error: string };

export interface ParsedSignatureHeader {
  timestamp: string | undefined;
  timestampCount: number;
  macs: string[];
}

/**
 * Parse X-Fanvue-Signature: "t=<unix seconds>,v0=<hex>" or, during a
 * signing-secret rotation, "t=<unix seconds>,v0=<old hex>,<new hex>".
 *
 * The parser is stateful on purpose: a field without "=" continues the list of
 * the previous key, which is how the rotation MAC joins `v0`. A keyed
 * split('=') parse would silently drop it.
 */
export function parseSignatureHeader(header: string): ParsedSignatureHeader {
  let key: string | undefined;
  let timestamp: string | undefined;
  let timestampCount = 0;
  const macs: string[] = [];

  for (const field of header.split(',')) {
    const separator = field.indexOf('=');
    if (separator !== -1) key = field.slice(0, separator).trim();
    // With separator === -1 this is the whole bare field.
    const value = field.slice(separator + 1).trim();
    if (key === 't') {
      timestamp = value;
      timestampCount += 1;
    } else if (key === 'v0' && value) {
      macs.push(value.toLowerCase());
    }
  }

  return { timestamp, timestampCount, macs };
}

/**
 * Verify a Fanvue webhook signature.
 *
 * Signed content: `${t}.${rawBody}` (raw body, not re-serialised JSON)
 * Algorithm:      HMAC-SHA256 keyed with the signing secret as given, hex digest
 */
export function verifyFanvueSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds: number = TOLERANCE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!header) {
    return { valid: false, error: 'Missing X-Fanvue-Signature header' };
  }

  const { timestamp, timestampCount, macs } = parseSignatureHeader(header);
  if (timestampCount !== 1 || !timestamp || !/^[0-9]+$/.test(timestamp) || macs.length === 0) {
    return { valid: false, error: 'Malformed X-Fanvue-Signature header' };
  }

  // `t` is inside the signed content, so it can't be refreshed on a replay.
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Accept when ANY MAC matches (two MACs are sent during secret rotation).
  const matched = macs.some(
    (mac) =>
      mac.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  );

  return matched ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

/** Envelope used by every Creator, Checkout and App event. */
export interface FanvueEnvelopeEvent {
  id: string;
  type: string;
  timestamp: string;
  data: { object: string; id?: string | null; [key: string]: unknown };
}

/** Deprecated flat event: camelCase fields plus `eventId`; nothing names the topic. */
export interface FanvueLegacyEvent {
  eventId?: string;
  recipientUuid?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export type FanvueEvent = FanvueEnvelopeEvent | FanvueLegacyEvent;

export function isEnvelopeEvent(event: FanvueEvent): event is FanvueEnvelopeEvent {
  return typeof event.type === 'string' && typeof event.data === 'object' && event.data !== null;
}

/**
 * Deduplication key. Envelope events carry `id`; legacy flat events carry
 * `eventId`. Two documented exceptions need the timestamp folded in.
 */
export function idempotencyKey(event: FanvueEvent): string | undefined {
  if (typeof event.type === 'string') {
    const envelope = event as FanvueEnvelopeEvent;
    // app.subscription.* ids hash subscription id + topic, so a repeated
    // transition reuses the earlier id.
    if (envelope.type.startsWith('app.subscription.')) {
      return `${envelope.id}:${envelope.timestamp}`;
    }
    return envelope.id;
  }
  const legacy = event as FanvueLegacyEvent;
  // Legacy message.read reuses one eventId for every receipt in a conversation.
  if ('readMessagesCount' in legacy) {
    return `${legacy.eventId}:${legacy.timestamp}`;
  }
  return (legacy.id as string | undefined) ?? legacy.eventId;
}
