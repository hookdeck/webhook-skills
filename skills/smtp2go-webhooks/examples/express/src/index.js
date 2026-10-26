// Generated with: smtp2go-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * SMTP2GO does not sign payloads. The only credential is the optional Authorization
 * header set on the webhook. Compare the WHOLE header value (e.g. "Bearer <token>"),
 * scheme prefix included; don't strip, parse or base64-decode it.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifySmtp2goRequest(headers, config = process.env) {
  const expected = config.SMTP2GO_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/** Body is flat JSON or form-encoded depending on the webhook's output type. */
function parseBody(raw, contentType = '') {
  if (/application\/x-www-form-urlencoded/i.test(contentType)) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Expected an object');
  }
  return payload;
}

function handleEvent(payload) {
  switch (payload.event) {
    case 'processed':
      console.log(`Processed ${payload.email_id} for ${payload.rcpt}`);
      break;

    case 'delivered':
      console.log(`Delivered ${payload.email_id} to ${payload.rcpt}`);
      // TODO: mark the message delivered
      break;

    case 'open':
      console.log(`Opened ${payload.email_id} by ${payload.rcpt}`);
      break;

    case 'click':
      console.log(`Click on ${payload.email_id} by ${payload.rcpt}`);
      break;

    case 'bounce':
      console.log(`Bounce (${payload.bounce}) for ${payload.rcpt}: ${payload.message}`);
      // TODO: suppress the address on hard bounces
      break;

    case 'spam':
      console.log(`Spam complaint from ${payload.rcpt}`);
      // TODO: remove the address from your lists
      break;

    case 'unsubscribe':
    case 'resubscribe':
      console.log(`${payload.event} by ${payload.rcpt}`);
      // TODO: update the recipient's preferences
      break;

    case 'reject':
      console.log(`Rejected ${payload.email_id} to ${payload.rcpt}`);
      break;

    case 'sms_sending':
    case 'sms_submitted':
    case 'sms_delivered':
    case 'sms_rejected':
      console.log(`${payload.event}: SMS ${payload.message_id} to ${payload.destination_number}`);
      break;

    case 'sms_failed':
      console.log(`SMS ${payload.message_id} to ${payload.destination_number} failed (${payload.status_code})`);
      // TODO: retry or alert
      break;

    default:
      console.log(`Unhandled SMTP2GO event: ${payload.event}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type SMTP2GO uses (JSON or form encoded).
app.post('/webhooks/smtp2go', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifySmtp2goRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = parseBody(raw, req.headers['content-type']);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON or form-encoded body' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling SMTP2GO webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySmtp2goRequest = verifySmtp2goRequest;
module.exports.parseBody = parseBody;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/smtp2go`);
  });
}
