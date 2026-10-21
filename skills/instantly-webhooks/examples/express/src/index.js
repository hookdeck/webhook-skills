// Generated with: instantly-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * INSTANTLY WEBHOOK AUTHENTICATION
 *
 * Instantly does NOT sign webhooks. There is no signature header, no HMAC and
 * no timestamp header. Instead, you attach custom HTTP headers to the webhook
 * (UI: Integrations -> Webhooks -> "Add headers", or the API v2 `headers`
 * object), for example:
 *
 *   Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=
 *   X-Instantly-Secret: <random value>
 *
 * Instantly sends that header unchanged on every delivery. Compare the WHOLE
 * value (scheme included) against the one you configured, in constant time.
 */

/** Header name to check. Node lowercases incoming header names. */
function headerName(env = process.env) {
  return (env.INSTANTLY_WEBHOOK_HEADER || 'authorization').trim().toLowerCase();
}

/**
 * Constant-time compare of the received header value.
 *
 * @param {string|undefined} received  The header value Instantly sent
 * @param {string|undefined} expected  INSTANTLY_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyInstantlyHeader(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(String(received), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Instantly payloads have no event ID. Build an idempotency key from the
 * fields that identify an event.
 */
function idempotencyKey(payload) {
  return [
    payload.event_type,
    payload.timestamp,
    payload.campaign_id,
    payload.lead_email,
    payload.step,
    payload.email_id,
  ]
    .map((v) => (v === undefined || v === null ? '' : String(v)))
    .join(':');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Instantly webhook endpoint.
 *
 * Nothing is signed over the body, but express.raw() keeps the order
 * "authenticate, then parse" and lets us return a clean 400 on bad JSON.
 */
app.post('/webhooks/instantly', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.INSTANTLY_WEBHOOK_SECRET;

  // Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
  if (!expected) {
    console.error('INSTANTLY_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }

  const name = headerName();
  const received = req.headers[name];
  if (!received) {
    return res.status(401).json({ error: `Missing ${name} header` });
  }

  if (!verifyInstantlyHeader(received, expected)) {
    console.error(`Instantly webhook ${name} header mismatch`);
    return res.status(401).json({ error: `Invalid ${name} header` });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  console.log(`✓ Authenticated Instantly webhook: ${payload.event_type} (${idempotencyKey(payload)})`);

  handleEvent(payload);

  res.status(200).json({ received: true });
});

function handleEvent(payload) {
  // TODO: check idempotencyKey(payload) against your store and return if seen.
  const lead = payload.lead_email || 'unknown lead';
  const campaign = payload.campaign_name || payload.campaign_id;

  switch (payload.event_type) {
    // --- Email events -------------------------------------------------------
    case 'email_sent':
      console.log(`📤 Email sent to ${lead} (campaign ${campaign}, step ${payload.step})`);
      break;
    case 'email_opened':
      console.log(`👀 ${lead} opened an email`);
      break;
    case 'email_link_clicked':
    case 'link_clicked': // name used in Instantly's events guide
      console.log(`🔗 ${lead} clicked a link`);
      break;
    case 'reply_received':
      console.log(`💬 Reply from ${lead}: ${payload.reply_text_snippet || ''}`);
      break;
    case 'auto_reply_received':
      console.log(`🤖 Auto-reply from ${lead}`);
      break;
    case 'email_bounced':
      console.log(`⛔ Email to ${lead} bounced`);
      break;
    case 'lead_unsubscribed':
      console.log(`🚫 ${lead} unsubscribed — add to suppression list`);
      break;
    case 'account_error':
      console.log(`⚠️  Sending account error: ${payload.email_account}`);
      break;
    case 'campaign_completed':
      console.log(`🏁 Campaign completed: ${campaign}`);
      break;

    // --- Lead status events -------------------------------------------------
    case 'lead_interested':
      console.log(`🔥 ${lead} is interested`);
      break;
    case 'lead_not_interested':
    case 'lead_neutral':
    case 'lead_closed':
    case 'lead_out_of_office':
    case 'lead_wrong_person':
      console.log(`🏷️  ${lead} status: ${payload.event_type}`);
      break;
    case 'lead_meeting_booked':
      console.log(`📅 Meeting booked with ${lead}`);
      break;
    case 'lead_meeting_completed':
    case 'lead_no_show':
      console.log(`📅 Meeting update for ${lead}: ${payload.event_type}`);
      break;

    default:
      // Custom labels arrive with the label name as event_type, as-is.
      console.log(`Custom label or unhandled Instantly event: ${payload.event_type}`);
  }
}

module.exports = { app, headerName, verifyInstantlyHeader, idempotencyKey };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Instantly webhook server listening on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/instantly`);
  });
}
