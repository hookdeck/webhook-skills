// Generated with: mailtrap-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// === Signature verification ================================================

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Verify a Mailtrap `Mailtrap-Signature` header.
 *
 * Mailtrap sends the lowercase hex HMAC-SHA256 of the RAW request body, keyed
 * with the webhook's signing secret (32 hex characters) used as a plain UTF-8
 * string. Do NOT hex-decode the secret. No timestamp, no prefix: the body alone
 * is signed, whether it is JSON or JSON Lines.
 *
 * The received value is checked against /^[0-9a-f]{64}$/i first because
 * Buffer.from(x, 'hex') silently truncates invalid hex. The hex strings are then
 * compared as equal-length UTF-8 buffers with crypto.timingSafeEqual.
 *
 * @param {Buffer|string} rawBody exact bytes received; re-serialised JSON fails
 * @param {string} signature value of the `Mailtrap-Signature` header
 * @param {string} secret the webhook's signing secret
 */
function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret || rawBody === undefined || rawBody === null) {
    return false;
  }
  const received = String(signature).trim();
  if (!HEX_SHA256.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(received.toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// === Payload parsing =======================================================

/**
 * A delivery is either a JSON object `{ "events": [...] }` or JSON Lines (one
 * event object per line). Both batch up to 500 events per request.
 * Throws on malformed input.
 */
function parseEvents(rawBody) {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.events)) return parsed.events;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return [parsed]; // single-line JSONL
    throw new Error('Unexpected payload shape');
  } catch (err) {
    if (err.message === 'Unexpected payload shape') throw err;
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

// === Event handling ========================================================

/**
 * Dedupe on `event_id` (Mailtrap's documented idempotency key for sending
 * events). Audit Log events have no event_id. Use a shared, durable store
 * (Redis, Postgres) in production; this Set is per-process.
 */
const processedEventIds = new Set();

function alreadyProcessed(eventId) {
  if (!eventId) return false;
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  return false;
}

/**
 * Dispatch one event. Sending events carry `event`: delivery, open, click,
 * unsubscribe, spam, "soft bounce" (with a space), bounce, suspension, reject.
 * Audit Log events (Enterprise) carry `event` values like activity_log.user.login.
 */
function handleEvent(evt) {
  switch (evt.event) {
    case 'delivery':
      console.log(`Delivered ${evt.message_id} to ${evt.email}`);
      // TODO: mark message delivered
      break;
    case 'open':
      console.log(`Opened by ${evt.email} (${evt.ip})`);
      break;
    case 'click':
      console.log(`Click by ${evt.email}: ${evt.url}`);
      break;
    case 'unsubscribe':
      console.log(`Unsubscribe from ${evt.email}`);
      // TODO: update consent
      break;
    case 'spam':
      console.log(`SPAM complaint from ${evt.email}`);
      // TODO: suppress immediately
      break;
    case 'soft bounce':
      console.log(`Soft bounce for ${evt.email}: ${evt.response_code} ${evt.bounce_category}`);
      // TODO: Mailtrap retries; count repeated soft bounces
      break;
    case 'bounce':
      console.log(`Hard bounce for ${evt.email}: ${evt.response_code} ${evt.bounce_category}`);
      // TODO: suppress this address
      break;
    case 'suspension':
      console.log(`Message suspended for ${evt.email}: ${evt.reason}`);
      break;
    case 'reject':
      console.log(`Message rejected for ${evt.email}: ${evt.reason}`);
      break;
    default:
      if (typeof evt.event === 'string' && evt.event.startsWith('activity_log.')) {
        console.log(`Audit log ${evt.event}: ${evt.description}`, evt.actor);
      } else {
        console.log('Unhandled Mailtrap event:', evt.event);
      }
  }
}

// === Routes ================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post(
  '/webhooks/mailtrap',
  // The signature covers the exact raw bytes, and the content type is
  // application/json or application/jsonl. type '*/*' makes both verify.
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.MAILTRAP_WEBHOOK_SECRET;
    if (!secret) {
      console.error('MAILTRAP_WEBHOOK_SECRET is not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const signature = req.header('Mailtrap-Signature');
    if (!signature) {
      return res.status(400).json({ error: 'Missing Mailtrap-Signature header' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    if (!verifySignature(rawBody, signature, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let events;
    try {
      events = parseEvents(rawBody);
    } catch {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Any non-200 makes Mailtrap retry (40 times, every 5 minutes), so acknowledge first.
    res.status(200).json({ received: true });

    for (const evt of events) {
      if (alreadyProcessed(evt.event_id)) continue;
      try {
        handleEvent(evt);
      } catch (err) {
        console.error('Error handling Mailtrap event:', err);
      }
    }
  }
);

const server = app.listen(PORT, () => {
  console.log(`Mailtrap webhook server running on port ${PORT}`);
  console.log(`  Endpoint: http://localhost:${PORT}/webhooks/mailtrap`);
});

module.exports = { app, server, verifySignature, parseEvents, handleEvent };
