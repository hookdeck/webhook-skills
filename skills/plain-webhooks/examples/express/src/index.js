// Generated with: plain-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const webhookSecret = process.env.PLAIN_WEBHOOK_SECRET;

/**
 * Verify a Plain request signature.
 * Plain sends hex(HMAC-SHA256(secret, rawBody)) in the Plain-Request-Signature header.
 */
function verifyPlainSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  // Reject anything that is not exactly 64 hex chars before comparing.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase(), 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false; // different lengths = invalid
  }
}

/**
 * Optional replay check (off unless PLAIN_TOLERANCE_SECONDS is set). The timestamp lives in the
 * body (webhookMetadata.webhookDeliveryAttemptTimestamp), not in the signature.
 */
function isTimestampFresh(event, toleranceSeconds) {
  const ts = Date.parse(event?.webhookMetadata?.webhookDeliveryAttemptTimestamp);
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) <= toleranceSeconds * 1000;
}

// Plain webhook endpoint - raw body is required for signature verification
app.post('/webhooks/plain', express.raw({ type: '*/*' }), (req, res) => {
  if (!webhookSecret) {
    console.error('PLAIN_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const signature = req.headers['plain-request-signature'];

  if (!signature) {
    return res.status(400).send('Missing Plain-Request-Signature header');
  }

  if (!verifyPlainSignature(rawBody, signature, webhookSecret)) {
    console.error('Plain webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const tolerance = Number(process.env.PLAIN_TOLERANCE_SECONDS);
  if (tolerance > 0 && !isTimestampFresh(event, tolerance)) {
    return res.status(400).send('Stale webhook timestamp');
  }

  // The event type is in payload.eventType (also sent as the Plain-Event-Type header).
  // event.id is stable across retries: use it as the idempotency key.
  const eventType = event.payload?.eventType;

  switch (eventType) {
    case 'thread.thread_created':
      console.log('Thread created:', event.payload.thread?.id);
      break;
    case 'thread.email_received':
      console.log('Email received on thread:', event.payload.thread?.id);
      break;
    case 'thread.thread_status_transitioned':
      console.log('Thread status changed:', event.payload.thread?.id);
      break;
    case 'customer.customer_created':
      console.log('Customer created:', event.payload.customer?.id);
      break;
    default:
      console.log('Unhandled Plain event:', eventType);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Plain webhook server listening on port ${port}`));
}

module.exports = app;
