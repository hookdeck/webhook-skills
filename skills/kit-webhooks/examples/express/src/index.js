// Generated with: kit-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set KIT_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`KIT_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Kit webhook signature.
 *
 * Header: `X-Kit-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]` (two v1 entries while a
 * secret rotation window is open).
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the endpoint secret used WHOLE as
 * UTF-8 bytes. Do not strip `whsec_` or base64-decode it (this is not Standard Webhooks).
 *
 * @param {Buffer|string} rawBody - Raw request body (do NOT re-stringify parsed JSON)
 * @param {string} header - `X-Kit-Signature` header value
 * @param {string} secret - Endpoint secret (e.g. whsec_xxxxx)
 * @param {number} toleranceSeconds - Max age of `t`; 0 turns the check off (default from env)
 * @param {number} nowSeconds - Current time in seconds (injectable for tests)
 * @returns {boolean} Whether any v1 signature is valid (and fresh, when a window is set)
 */
function verifyKitWebhook(
  rawBody,
  header,
  secret,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;

  // Kit suggests a 5-minute window, but Hookdeck retries and replays keep the original `t`,
  // so the window is opt-in (toleranceSeconds > 0).
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch = invalid
    }
  });
}

// Kit webhook endpoint - express.raw({ type: '*/*' }) keeps the raw bytes for any content type.
app.post('/webhooks/kit', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['x-kit-signature'];
  const secret = process.env.KIT_WEBHOOK_SECRET;

  if (!header) {
    return res.status(400).send('Missing X-Kit-Signature header');
  }
  if (!secret) {
    console.error('KIT_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }
  if (!verifyKitWebhook(req.body, header, secret)) {
    console.error('Kit webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification. The body is an envelope: { delivery_id, events: [...] }.
  let delivery;
  try {
    delivery = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!Array.isArray(delivery?.events)) {
    return res.status(400).send('Expected an events array');
  }

  // A delivery carries 1-100 events of the same type; always iterate.
  for (const event of delivery.events) {
    const { type, data } = event;
    const email = data?.subscriber?.email_address;
    switch (type) {
      case 'subscriber.created':
        console.log(`Subscriber created: ${email}`);
        break;
      case 'subscriber.activated':
        console.log(`Subscriber activated: ${email}`);
        break;
      case 'subscriber.unsubscribed':
        console.log(`Subscriber unsubscribed: ${email}`);
        break;
      case 'subscriber.bounced':
        console.log(`Subscriber bounced: ${email}`);
        break;
      case 'subscriber.complained':
        console.log(`Subscriber complained (spam report): ${email}`);
        break;
      case 'subscriber.subscribed_to_form':
        console.log(`Subscriber ${email} joined form ${data?.form?.name}`);
        break;
      case 'subscriber.tag_added':
        console.log(`Tag "${data?.tag?.name}" added to ${email}`);
        break;
      case 'subscriber.tag_removed':
        console.log(`Tag "${data?.tag?.name}" removed from ${email}`);
        break;
      default:
        console.log(`Unhandled event type: ${type}`);
    }
    // TODO: persist / forward. Deduplicate on event.id (stable across retries and re-emits),
    // not on delivery_id.
  }

  // Any 2xx acknowledges; non-2xx is retried (8 attempts over ~41 hours).
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyKitWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/kit`);
  });
}
