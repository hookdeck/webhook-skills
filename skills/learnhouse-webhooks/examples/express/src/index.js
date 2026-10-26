// Generated with: learnhouse-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

// LearnHouse sends X-Webhook-Signature: sha256=<hex>, the HMAC-SHA256 of the raw
// body bytes keyed with the whole whsec_... secret (plain UTF-8 key, NOT Standard Webhooks).
function verifyLearnhouseSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !header || !secret) return false;
  const value = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;
  // Validate length and alphabet before decoding: Buffer.from(x, 'hex') drops bad characters
  if (!HEX_SHA256.test(value)) return false;
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : undefined);

// Deliveries are at-least-once. Use a database or cache in production.
const seenDeliveries = new Set();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// express.raw with '*/*' keeps the exact bytes whatever the content type is
app.post('/webhooks/learnhouse', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyLearnhouseSignature(rawBody, req.get('x-webhook-signature'), process.env.LEARNHOUSE_WEBHOOK_SECRET)) {
    console.error('LearnHouse signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse only after the signature is verified, and treat every field as untrusted
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!isObject(payload) || typeof payload.event !== 'string') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const event = payload.event;
  const deliveryId = str(payload.delivery_id) ?? str(req.get('x-webhook-delivery'));
  if (deliveryId) {
    if (seenDeliveries.has(deliveryId)) {
      return res.json({ received: true, duplicate: true });
    }
    seenDeliveries.add(deliveryId);
  }

  const data = isObject(payload.data) ? payload.data : {};
  const user = isObject(data.user) ? data.user : {};
  const course = isObject(data.course) ? data.course : {};

  switch (event) {
    case 'ping':
      console.log('LearnHouse ping received');
      break;
    case 'course_enrolled':
      console.log(`${str(user.email)} enrolled in ${str(course.name)}`);
      break;
    case 'course_completed':
      console.log(`${str(user.email)} completed ${str(course.name)}`);
      // e.g. send a certificate email, update your CRM
      break;
    case 'activity_completed':
    case 'assignment_submitted':
    case 'assignment_graded':
    case 'certificate_claimed':
      console.log(`LearnHouse ${event} (delivery ${deliveryId})`);
      break;
    case 'user_signed_up':
      console.log(`New LearnHouse user: ${str(user.email)}`);
      break;
    default:
      console.log(`Unhandled LearnHouse event: ${event}`);
  }

  // Any 2xx marks the delivery successful
  res.json({ received: true });
});

app.use((err, req, res, next) => {
  console.error('Webhook error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`LearnHouse webhook server running on port ${PORT}`);
    if (!process.env.LEARNHOUSE_WEBHOOK_SECRET) {
      console.warn('WARNING: LEARNHOUSE_WEBHOOK_SECRET not set. Webhooks will fail verification.');
    }
  });
}

module.exports = app;
