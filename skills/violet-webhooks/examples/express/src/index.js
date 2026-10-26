// Generated with: violet-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// X-Violet-Hmac is the standard (padded) base64 of a 32-byte digest: 43 characters plus "="
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a Violet webhook signature.
 *
 * Violet sends `X-Violet-Hmac: <base64>`, the base64 HMAC-SHA256 of the raw request body bytes,
 * keyed with the app secret used as UTF-8 (not hex- or base64-decoded). Nothing else is signed.
 */
function verifyVioletSignature(rawBody, signatureHeader, secret) {
  // Validate the format first: Buffer.from(x, 'base64') silently drops bad characters
  if (typeof signatureHeader !== 'string' || !SIGNATURE_FORMAT.test(signatureHeader)) return false;
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  );
  const received = Buffer.from(signatureHeader);
  // Compare the base64 strings exactly (as Hookdeck does): a value whose last character carries
  // stray low bits decodes to the same digest but is not the string Violet sends
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Every field of the body is untrusted: read through type checks, never assume a shape
function summarize(body) {
  const id = typeof body.id === 'string' || typeof body.id === 'number' ? body.id : 'unknown';
  const status = typeof body.status === 'string' ? body.status : undefined;
  return { id, status };
}

// Violet sends the entity itself as the body and names the event only in X-Violet-Topic
function handleEvent(topic, body) {
  switch (topic) {
    case 'ORDER_ACCEPTED':
    case 'ORDER_UPDATED':
    case 'ORDER_COMPLETED':
    case 'ORDER_SHIPPED':
    case 'ORDER_DELIVERED':
    case 'ORDER_REFUNDED':
    case 'ORDER_CANCELLED':
    case 'ORDER_FAILED': {
      const { id, status } = summarize(body);
      console.log(`${topic}: order ${id}${status ? ` (${status})` : ''}`);
      break;
    }
    case 'MERCHANT_CONNECTED':
    case 'MERCHANT_DISCONNECTED':
    case 'MERCHANT_ENABLED':
    case 'MERCHANT_DISABLED':
    case 'MERCHANT_NEEDS_ATTENTION':
    case 'MERCHANT_COMPLETE': {
      const { id, status } = summarize(body);
      const name = typeof body.name === 'string' ? body.name : 'unknown';
      console.log(`${topic}: merchant ${id} "${name}"${status ? ` (${status})` : ''}`);
      break;
    }
    case 'TRANSFER_SENT':
    case 'TRANSFER_PARTIALLY_SENT':
    case 'TRANSFER_FAILED':
    case 'TRANSFER_UPDATED':
    case 'TRANSFER_REVERSED':
    case 'TRANSFER_PARTIALLY_REVERSED':
    case 'TRANSFER_REVERSAL_FAILED': {
      const { id, status } = summarize(body);
      const amount = typeof body.amount === 'number' ? body.amount : 'unknown';
      const currency = typeof body.currency === 'string' ? body.currency : '';
      console.log(`${topic}: transfer ${id} ${amount} ${currency}`.trim() + (status ? ` (${status})` : ''));
      break;
    }
    default:
      // 52 documented events: handle the ones you need and log the rest
      console.log(`Unhandled Violet topic: ${topic}`);
  }
}

// Read the raw body for ANY content type so the exact bytes are verified before parsing
app.post('/webhooks/violet', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.VIOLET_WEBHOOK_SECRET;
  if (!secret) {
    console.error('VIOLET_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyVioletSignature(rawBody, req.headers['x-violet-hmac'], secret)) {
    console.error('Violet webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Only the header names the event: without it the body cannot be classified
  const topic = req.headers['x-violet-topic'];
  if (typeof topic !== 'string' || topic === '') {
    return res.status(400).send('Missing X-Violet-Topic header');
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(body)) {
    return res.status(400).send('Body must be a JSON object');
  }

  // X-Violet-Event-Id identifies the event: use it for idempotency (retries and resends repeat it)
  const eventId = req.headers['x-violet-event-id'];
  console.log(`Violet event ${typeof eventId === 'string' ? eventId : '(no id)'}`);
  handleEvent(topic, body);

  // Respond 2XX within 10 seconds; do slow work asynchronously
  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`Violet webhook server listening on port ${port}`));
}

module.exports = { app, verifyVioletSignature, handleEvent };
