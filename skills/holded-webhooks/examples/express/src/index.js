// Generated with: holded-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verify a Holded webhook signature.
 *
 * Header:    x-holded-webhook-signature: sha256=<64 hex chars>
 * Signed:    the raw request body only (x-holded-webhook-date is NOT signed)
 * Algorithm: HMAC-SHA256, hex digest, keyed with the whole secret string as
 *            UTF-8, including the whsec_ prefix (this is not Standard Webhooks)
 */
function verifyHoldedSignature(rawBody, header, secret) {
  if (!header) {
    return { valid: false, error: 'Missing x-holded-webhook-signature header' };
  }
  if (!header.startsWith(SIGNATURE_PREFIX)) {
    return { valid: false, error: 'Signature must start with sha256=' };
  }

  const received = header.slice(SIGNATURE_PREFIX.length);
  // Buffer.from(x, 'hex') silently truncates at the first invalid character,
  // so check the shape before decoding.
  if (!/^[0-9a-f]{64}$/i.test(received)) {
    return { valid: false, error: 'Malformed signature' };
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const valid = crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
  return valid ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

// In-memory idempotency store; use Redis or a database in production.
const processedIds = new Set();

function handleEvent(eventName, data) {
  switch (eventName) {
    case 'invoice.create':
      console.log('Invoice created:', data?.id);
      break;
    case 'invoice.update':
      console.log('Invoice updated:', data?.id);
      break;
    case 'invoice.approve':
      console.log('Invoice approved:', data?.id);
      break;
    case 'invoice.delete':
      console.log('Invoice deleted:', data?.id);
      break;
    case 'contact.create':
      console.log('Contact created:', data?.id);
      break;
    case 'contact.update':
      console.log('Contact updated:', data?.id);
      break;
    case 'contact.delete':
      console.log('Contact deleted:', data?.id);
      break;
    case 'payment.create':
      console.log('Payment created:', data?.id);
      break;
    case 'payment.update':
      console.log('Payment updated:', data?.id);
      break;
    case 'payment.delete':
      console.log('Payment deleted:', data?.id);
      break;
    case 'stock.update':
      console.log('Stock updated:', data?.id);
      break;
    default:
      // Other document types (creditnote.*, purchase.*, product.*, ...) are
      // acknowledged too: a non-2xx makes Holded retry.
      console.log('Unhandled Holded event:', eventName);
  }
}

// express.raw with '*/*' keeps the exact bytes Holded signed for any content type.
app.post('/webhooks/holded', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.HOLDED_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HOLDED_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyHoldedSignature(rawBody, req.get('x-holded-webhook-signature'), secret);
  if (!result.valid) {
    console.error(`Holded signature verification failed: ${result.error}`);
    return res.status(401).send(result.error);
  }

  let data;
  try {
    data = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event name travels in a header, which is not covered by the signature
  // but arrives alongside the signed body.
  const eventName = req.get('x-holded-webhook-event') || 'unknown';
  const eventId = req.get('x-holded-webhook-id');

  // x-holded-webhook-id is Holded's idempotency key (deliveries are retried).
  if (eventId && processedIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  handleEvent(eventName, data);
  if (eventId) processedIds.add(eventId);

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
module.exports.verifyHoldedSignature = verifyHoldedSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Holded webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/holded`);
  });
}
