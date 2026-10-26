// Generated with: hume-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const HEX_DIGEST_RE = /^[0-9a-fA-F]{64}$/;
const UNIX_SECONDS_RE = /^[0-9]+$/;

// Hume's own example rejects deliveries older than 180 seconds, but Hookdeck
// retries and replays resend the ORIGINAL headers and timestamp (and Hookdeck
// applies no tolerance itself), so a fixed window would reject legitimate
// retries. The check is OFF by default; set HUME_WEBHOOK_TOLERANCE_SECONDS to
// opt in. Read at call time so it can be changed without a restart in tests.
function defaultTolerance() {
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
 *
 * @param {Buffer} rawBody - Raw request bytes (never re-serialized JSON)
 * @param {string|undefined} signatureHeader - `X-Hume-AI-Webhook-Signature` value
 * @param {string|undefined} timestampHeader - `X-Hume-AI-Webhook-Timestamp` value
 * @param {string|undefined} secret - The account's webhook signing key
 * @param {number} toleranceSeconds - 0 disables the staleness check
 * @returns {boolean}
 */
function verifyHumeSignature(
  rawBody,
  signatureHeader,
  timestampHeader,
  secret,
  toleranceSeconds = defaultTolerance()
) {
  if (!secret || typeof signatureHeader !== 'string' || typeof timestampHeader !== 'string') {
    return false;
  }
  if (!signatureHeader || !timestampHeader) return false;

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

/**
 * Dispatch a verified Hume EVI event on `event_name`.
 *
 * Documented events: chat_started, chat_ended, tool_call. Anything else is
 * logged and acknowledged.
 *
 * @returns {string} what was handled, e.g. "chat_ended" or "unhandled:<name>"
 */
function handleHumeEvent(event) {
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

// CRITICAL: express.raw() with '*/*' so any content type reaches the handler as
// the exact bytes Hume signed. Parse JSON only AFTER the signature check.
app.post('/webhooks/hume', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (
    !verifyHumeSignature(
      rawBody,
      req.get('x-hume-ai-webhook-signature'),
      req.get('x-hume-ai-webhook-timestamp'),
      process.env.HUME_WEBHOOK_SECRET
    )
  ) {
    console.error('Hume signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).send('Invalid payload');
  }

  handleHumeEvent(event);
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyHumeSignature, handleHumeEvent };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/hume`);
  });
}
