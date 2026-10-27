// Generated with: hume-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

const HEX_DIGEST_RE = /^[0-9a-fA-F]{64}$/;
const UNIX_SECONDS_RE = /^[0-9]+$/;

// Hume's own example rejects deliveries older than 180 seconds, but Hookdeck
// retries and replays resend the ORIGINAL headers and timestamp (and Hookdeck
// applies no tolerance itself), so a fixed window would reject legitimate
// retries. The check is OFF by default; set HUME_WEBHOOK_TOLERANCE_SECONDS to
// opt in. Read at call time so it can be changed without a restart in tests.
export function defaultTolerance(): number {
  const n = Number.parseInt(process.env.HUME_WEBHOOK_TOLERANCE_SECONDS || '0', 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Verify a Hume EVI webhook signature.
 *
 * Hume sends `X-Hume-AI-Webhook-Signature: <hex>` (bare digest, no prefix) and
 * `X-Hume-AI-Webhook-Timestamp: <unix seconds>`. The digest is
 * HMAC-SHA256(signing key, "<raw body>.<timestamp>"). The message is built as
 * BYTES: the raw body bytes untouched, a literal ".", then the timestamp header
 * exactly as received (latin1).
 */
export function verifyHumeSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  secret: string | undefined,
  toleranceSeconds: number = defaultTolerance()
): boolean {
  if (!secret || !signatureHeader || !timestampHeader) return false;

  // The whole header is one bare hex digest. Validate the format BEFORE
  // decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!HEX_DIGEST_RE.test(signatureHeader)) return false;

  // Optional staleness check (not enabled by default, see above)
  if (toleranceSeconds > 0) {
    if (!UNIX_SECONDS_RE.test(timestampHeader)) return false;
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestampHeader));
    if (age > toleranceSeconds) return false;
  }

  // Body FIRST, then a period, then the timestamp
  const signedContent = Buffer.concat([
    rawBody,
    Buffer.from('.', 'utf8'),
    Buffer.from(timestampHeader, 'latin1'),
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest();

  // Hex is case-insensitive, so decode to bytes and compare in constant time
  const provided = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

export interface HumeEvent {
  event_name?: string;
  chat_group_id?: string;
  chat_id?: string;
  config_id?: string;
  caller_number?: string | null;
  custom_session_id?: string | null;
  start_time?: number;
  chat_start_type?: string;
  end_time?: number;
  duration_seconds?: number;
  end_reason?: string;
  timestamp?: number;
  tool_call_message?: {
    name?: string;
    parameters?: string;
    response_required?: boolean;
    tool_call_id?: string;
    tool_type?: string;
  };
}

/**
 * Dispatch a verified Hume EVI event on `event_name`.
 *
 * Documented events: chat_started, chat_ended, tool_call. Anything else is
 * logged and acknowledged.
 *
 * Returns what was handled, e.g. "chat_ended" or "unhandled:<name>".
 */
export function handleHumeEvent(event: HumeEvent): string {
  switch (event.event_name) {
    case 'chat_started':
      console.log(`Chat ${event.chat_id} started (${event.chat_start_type})`);
      // TODO: start a logging session, update a dashboard, notify a team
      return 'chat_started';

    case 'chat_ended':
      console.log(
        `Chat ${event.chat_id} ended after ${event.duration_seconds}s (${event.end_reason})`
      );
      // TODO: save session data, process the transcript, track end_reason
      return 'chat_ended';

    case 'tool_call':
      console.log(
        `Chat ${event.chat_id} tool call: ${event.tool_call_message?.name}` +
          ` (response_required=${event.tool_call_message?.response_required})`
      );
      // TODO: run the tool server-side, then reply via the EVI Control Plane API
      return 'tool_call';

    default:
      console.log(`Unhandled Hume event: ${event.event_name}`);
      return `unhandled:${event.event_name}`;
  }
}
