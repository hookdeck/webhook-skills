// Generated with: didit-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// X-Timestamp window, off by default (0). Didit recommends 300 seconds, but a gateway such as
// Hookdeck re-sends retries and replays with the original X-Timestamp, so a default window
// would reject them. Set DIDIT_TIMESTAMP_TOLERANCE_SECONDS to a positive value to opt in.
const DEFAULT_TOLERANCE_SECONDS = 0;

/**
 * Verify a Didit webhook.
 *
 * Didit sends X-Signature = hex HMAC-SHA256 of the exact raw request bytes,
 * keyed with the destination's secret_shared_key (used as a raw string).
 * X-Timestamp (unix seconds) is a separate header and is NOT part of the signed
 * input; Didit's docs say to reject anything older than 300 seconds. That check is opt-in here.
 *
 * @param {Buffer|string} rawBody  Raw request body, before any JSON parsing
 * @param {string|undefined} signature  X-Signature header
 * @param {string|undefined} timestamp  X-Timestamp header
 * @param {string} secret  The destination's secret_shared_key
 * @param {number} [toleranceSeconds]  0 disables the timestamp check
 * @param {number} [now]  Current unix time in seconds (injectable for tests)
 * @returns {{valid: boolean, error?: string}}
 */
function verifyDiditSignature(
  rawBody,
  signature,
  timestamp,
  secret,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  now = Math.floor(Date.now() / 1000)
) {
  if (!signature) return { valid: false, error: 'Missing X-Signature header' };
  if (!secret) return { valid: false, error: 'Missing webhook secret' };

  if (toleranceSeconds > 0) {
    const ts = Number.parseInt(timestamp, 10);
    if (!timestamp || Number.isNaN(ts)) {
      return { valid: false, error: 'Missing or invalid X-Timestamp header' };
    }
    if (Math.abs(now - ts) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance window' };
    }
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

// A value that isn't a whole number of seconds is treated as 0 (check off), with a warning.
let warnedInvalidTolerance = false;
function toleranceFromEnv(env = process.env) {
  const raw = (env.DIDIT_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return DEFAULT_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`DIDIT_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
toleranceFromEnv(); // surface an invalid value at startup

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the body as a Buffer so X-Signature is checked
// against the exact bytes Didit sent. Don't use express.json() on this route.
app.post('/webhooks/didit', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('DIDIT_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyDiditSignature(
    rawBody,
    req.get('X-Signature'),
    req.get('X-Timestamp'),
    secret,
    toleranceFromEnv()
  );
  if (!result.valid) {
    console.error(`Didit webhook rejected: ${result.error}`);
    return res.status(400).json({ error: result.error });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // event_id is stable across retries and fan-out: use it as the idempotency key.
  // TODO: skip if event.event_id was already processed.
  console.log(`Verified Didit webhook: ${event.webhook_type} (${event.event_id})`);

  switch (event.webhook_type) {
    case 'status.updated':
      // Session status changed. status is e.g. "Approved", "Declined", "In Review",
      // "Abandoned", "Resubmitted". decision is present for the first four.
      // KYB payloads add session_kind: "business" and business_session_id.
      console.log(
        `Session ${event.session_id} is now ${event.status}` +
          (event.vendor_data ? ` (vendor_data: ${event.vendor_data})` : '')
      );
      break;

    case 'data.updated':
      // Verification data was edited after creation (e.g. manual reviewer correction).
      // trigger may be "manual_review", "manual_step_update" or "ongoing_monitoring".
      console.log(`Session ${event.session_id} data updated (trigger: ${event.trigger || 'n/a'})`);
      break;

    default:
      // Other subscribable events: user.status.updated, transaction.created, etc.
      console.log(`Unhandled Didit event: ${event.webhook_type}`);
  }

  // Respond 2xx quickly; Didit times out after 5 seconds and retries 5xx/404.
  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Didit webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/didit`);
  });
}

module.exports = { app, verifyDiditSignature, toleranceFromEnv };
