// Generated with: micetribe-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// X-Timestamp window, off by default (0). A gateway such as Hookdeck re-sends retries and
// replays with the original X-Timestamp, so a default window would reject them. Set
// MICETRIBE_WEBHOOK_TOLERANCE_SECONDS to a positive value to opt in.
const DEFAULT_TOLERANCE_SECONDS = 0;

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a MICEtribe webhook.
 *
 * X-Signature = hex HMAC-SHA256( secret, X-Timestamp + "." + raw_request_body ),
 * keyed with the webhook's signing secret as UTF-8 bytes. The signed message is built as
 * bytes: the X-Timestamp header string (latin1), a literal ".", then the exact body bytes.
 *
 * @param {Buffer} rawBody  Raw request body, before any JSON parsing
 * @param {string|undefined} signature  X-Signature header (bare hex digest)
 * @param {string|undefined} timestamp  X-Timestamp header (unix seconds, as sent)
 * @param {string} secret  The webhook's signing secret
 * @param {number} [toleranceSeconds]  0 disables the timestamp check
 * @param {number} [now]  Current unix time in seconds (injectable for tests)
 * @returns {{valid: boolean, error?: string}}
 */
function verifyMicetribeSignature(
  rawBody,
  signature,
  timestamp,
  secret,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  now = Math.floor(Date.now() / 1000)
) {
  if (!signature) return { valid: false, error: 'Missing X-Signature header' };
  if (!timestamp) return { valid: false, error: 'Missing X-Timestamp header' };
  if (!secret) return { valid: false, error: 'Missing webhook secret' };
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_SHA256.test(signature)) return { valid: false, error: 'Malformed X-Signature header' };

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Invalid X-Timestamp header' };
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance window' };
    }
  }

  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.', 'utf8'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated above
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

// A value that isn't a whole number of seconds is treated as 0 (check off), with a warning.
let warnedInvalidTolerance = false;
function toleranceFromEnv(env = process.env) {
  const raw = (env.MICETRIBE_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return DEFAULT_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MICETRIBE_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
toleranceFromEnv(); // surface an invalid value at startup

// In-memory dedupe for the demo. Use a durable store (Redis, database unique key) in production.
const processed = new Set();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the body as a Buffer so X-Signature is checked against the
// exact bytes MICEtribe sent. Don't use express.json() on this route.
app.post('/webhooks/micetribe', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.MICETRIBE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MICETRIBE_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyMicetribeSignature(
    rawBody,
    req.get('X-Signature'),
    req.get('X-Timestamp'),
    secret,
    toleranceFromEnv()
  );
  if (!result.valid) {
    console.error(`MICEtribe webhook rejected: ${result.error}`);
    return res.status(401).json({ error: result.error });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const trigger = event && event.meta && event.meta.trigger;

  // Idempotency key: registration_id + meta.trigger + X-Request-Id.
  const key = `${event && event.registration_id}:${trigger}:${req.get('X-Request-Id')}`;
  if (processed.has(key)) {
    return res.json({ received: true, duplicate: true });
  }
  processed.add(key);

  console.log(`Verified MICEtribe webhook: ${trigger} (registration ${event.registration_id})`);

  switch (trigger) {
    case 'registration.created':
      // A new registration was created. data.registration_data holds the attendee's fields.
      console.log(`New registration for ${event.data?.registration_data?.email} (${event.meta.event_name})`);
      break;

    case 'registration.updated':
      // An existing registration changed. data.entry_status is e.g. "Approved".
      console.log(`Registration ${event.registration_id} updated, status ${event.data?.entry_status}`);
      break;

    case 'registration.deleted':
      console.log(`Registration ${event.registration_id} deleted`);
      break;

    case 'registration.attended':
      // Attendance recorded: data.checkin.attended / checkin_at.
      console.log(`Registration ${event.registration_id} attended at ${event.data?.checkin?.checkin_at}`);
      break;

    case 'registration.printed':
      // Badge printed: data.print.print_count / last_printed_at.
      console.log(`Registration ${event.registration_id} badge printed (${event.data?.print?.print_count})`);
      break;

    default:
      console.log(`Unhandled MICEtribe event: ${trigger}`);
  }

  // Respond 2xx within 10 seconds; 3xx and above, errors and timeouts are retried.
  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MICEtribe webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/micetribe`);
  });
}

module.exports = { app, verifyMicetribeSignature, toleranceFromEnv };
