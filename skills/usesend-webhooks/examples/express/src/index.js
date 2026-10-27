require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// X-UseSend-Signature is `v1=<hex>`; Hookdeck also accepts the bare digest.
const HEX_DIGEST = /^[0-9a-f]{64}$/;

/**
 * useSend signs `${X-UseSend-Timestamp}.${rawBody}` with HMAC-SHA256 and sends
 * the lowercase hex digest as `v1=<hex>`. The secret is used whole (including
 * `whsec_`) as a plain UTF-8 key. This is NOT Standard Webhooks.
 *
 * The message is built as bytes so the raw body is never decoded and re-encoded.
 */
function verifyUseSend(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;
  const hex = (signature.startsWith('v1=') ? signature.slice(3) : signature).toLowerCase();
  // Validate length and alphabet first: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_DIGEST.test(hex)) return false;

  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.'),
    rawBody,
  ]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(message)
    .digest();
  return crypto.timingSafeEqual(expected, Buffer.from(hex, 'hex'));
}

// Opt-in replay window. X-UseSend-Timestamp is Unix MILLISECONDS.
function withinTolerance(timestamp, toleranceSeconds) {
  if (!toleranceSeconds || toleranceSeconds <= 0) return true;
  if (!/^\d+$/.test(timestamp)) return false;
  return Math.abs(Date.now() - Number(timestamp)) <= toleranceSeconds * 1000;
}

// Raw body for every content type, so the exact bytes are verified.
app.post('/webhooks/usesend', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.USESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('USESEND_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.get('x-usesend-signature');
  const timestamp = req.get('x-usesend-timestamp');

  if (!verifyUseSend(rawBody, signature, timestamp, secret)) {
    return res.status(401).send('Invalid signature');
  }
  const tolerance = Number(process.env.USESEND_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!withinTolerance(timestamp, tolerance)) {
    return res.status(401).send('Timestamp outside tolerance');
  }

  // Parse only after the signature check.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Duplicates are possible: dedupe on event.id in production.
  switch (event.type) {
    case 'email.delivered':
      console.log('Email delivered to:', event.data?.to);
      break;
    case 'email.bounced':
      console.log('Email bounced:', event.data?.id, event.data?.bounce?.type);
      break;
    case 'email.complained':
      console.log('Spam complaint for email:', event.data?.id);
      break;
    case 'email.opened':
      console.log('Email opened:', event.data?.id);
      break;
    case 'email.clicked':
      console.log('Link clicked:', event.data?.click?.url);
      break;
    case 'contact.created':
      console.log('Contact created:', event.data?.email);
      break;
    case 'domain.verified':
      console.log('Domain verified:', event.data?.name);
      break;
    case 'webhook.test':
      console.log('Test webhook received:', event.data?.webhookId ?? event.webhookId);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  res.status(200).send('ok');
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`useSend webhook server listening on http://localhost:${port}/webhooks/usesend`);
  });
}

module.exports = { app, verifyUseSend };
