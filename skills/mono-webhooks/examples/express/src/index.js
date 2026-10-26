// Generated with: mono-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Mono does not sign payloads. Every webhook carries a mono-webhook-secret header
 * holding the app's webhook secret as plain text; compare the whole value.
 * A static shared credential authenticates the sender, not the body, and gives no
 * replay protection, so use HTTPS and rotate the secret if it leaks.
 */
function verifyMonoRequest(headers, secret = process.env.MONO_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers['mono-webhook-secret'];
  return Boolean(received) && safeEqual(received, secret);
}

// event_id is reused across Mono's retries. Use a shared store (Redis, a DB unique key) in production.
const seenEventIds = new Set();

function handleEvent(payload) {
  const { event, data } = payload;

  switch (event) {
    case 'mono.events.account_connected':
      console.log(`Account connected: ${data?.id}`);
      // TODO: store data.id for the customer (data.meta.ref) and start retrieving data
      break;

    case 'mono.events.account_updated':
      console.log(`Account updated: ${data?.account?._id}`);
      // TODO: sync data.account and check data.meta.data_status
      break;

    case 'mono.events.account_unlinked':
      console.log('Account unlinked');
      // TODO: remove the stored account
      break;

    case 'direct_debit.payment_successful':
      console.log(`Payment successful: ${data?.object?.reference}`);
      // TODO: fulfil the order for data.object.reference
      break;

    case 'direct_debit.payment_failed':
      console.log(`Payment failed: ${data?.object?.reference}`);
      // TODO: notify the customer and offer a retry
      break;

    case 'direct_debit.payment_cancelled':
      console.log(`Payment cancelled: ${data?.object?.reference}`);
      // TODO: release held stock
      break;

    case 'direct_debit.payment_abandoned':
      console.log(`Payment abandoned: ${data?.object?.reference}`);
      // TODO: expire the pending payment
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/mono', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyMonoRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing mono-webhook-secret' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  if (payload.event_id && seenEventIds.has(payload.event_id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Mono event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (payload.event_id) seenEventIds.add(payload.event_id);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMonoRequest = verifyMonoRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mono`);
  });
}
