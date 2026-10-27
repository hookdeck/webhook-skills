// Generated with: chatim-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Chatim sends X-Chatim-Signature: "sha256=<hex>" and X-Chatim-Timestamp (Unix seconds).
// The signature is HMAC-SHA256 (hex) of "<X-Chatim-Timestamp>.<raw body>" keyed with the webhook secret.
// https://chatim.app/en/documentation/webhooks/

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set CHATIM_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.CHATIM_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`CHATIM_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

function verifyChatim(rawBody, signatureHeader, timestampHeader, secret) {
  if (!secret || !signatureHeader || !timestampHeader) return false;

  // Accept "sha256=<hex>" or the bare digest; validate length and alphabet before decoding
  const hex = signatureHeader.startsWith('sha256=') ? signatureHeader.slice('sha256='.length) : signatureHeader;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  const received = Buffer.from(hex, 'hex');

  // Opt-in replay window; X-Chatim-Timestamp is Unix seconds
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestampHeader)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestampHeader)) > tolerance) return false;
  }

  // Signed message as bytes: timestamp header (latin1, untouched) + "." + raw body bytes
  const message = Buffer.concat([Buffer.from(timestampHeader, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Raw body is required: the signature covers the exact bytes Chatim sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.post('/webhooks/chatim', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CHATIM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHATIM_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyChatim(rawBody, req.headers['x-chatim-signature'], req.headers['x-chatim-timestamp'], secret)) {
    // Chatim treats 4xx as a permanent failure (no retry), so only answer 4xx for a bad signature
    console.error('Chatim webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Use payload.eventId (or the X-Chatim-Delivery-Id header) for idempotency
  const data = payload.data || {};
  const visitor = data.visitor || {};

  switch (payload.event) {
    case 'chat.started':
      console.log(`Chat ${payload.chatUuid} started by ${visitor.name || visitor.uuid} on ${data.page?.url}`);
      break;
    case 'chat.message.received':
      console.log(`Message from ${visitor.name || visitor.uuid}: ${data.message}`);
      break;
    case 'chat.form.submitted':
      console.log(`Form "${data.formName}" submitted:`, data.fields);
      break;
    case 'chat.closed':
      console.log(`Chat ${payload.chatUuid} closed by ${data.closedBy} after ${data.duration}s`);
      break;
    case 'chat.assigned':
      console.log(`Chat ${payload.chatUuid} assigned to ${data.assignedTo?.name}`);
      break;
    case 'chat.handoff':
      console.log(`Chat ${payload.chatUuid} handed off to live chat: ${data.reason}`);
      break;
    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Chatim webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyChatim };
