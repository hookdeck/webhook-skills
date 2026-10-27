// Generated with: infinite-giving-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Verify an Infinite Giving webhook.
 *
 * X-IG-Signature is `sha256=<hex>`: lowercase hex HMAC-SHA256, keyed with the
 * partner signing secret (UTF-8), over `{X-IG-Timestamp}.{raw body}`.
 *
 * The signed message is built as bytes: the timestamp header exactly as received
 * (latin1), a literal ".", then the raw body bytes. Never parse the body first.
 *
 * Returns { valid: boolean, error?: string }.
 */
function verifyInfiniteGivingWebhook(rawBody, timestamp, signature, secret, toleranceSeconds = 0) {
  if (!secret) return { valid: false, error: 'Webhook secret not configured' };
  if (!timestamp) return { valid: false, error: 'Missing X-IG-Timestamp header' };
  if (!signature) return { valid: false, error: 'Missing X-IG-Signature header' };

  // The `sha256=` prefix is optional. Hex is case-insensitive.
  const hex = signature.replace(/^sha256=/, '').toLowerCase();

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    return { valid: false, error: 'Malformed signature' };
  }

  const signedContent = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest();
  const received = Buffer.from(hex, 'hex');

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  // Opt-in replay window. Off by default: retries and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    const sent = /^\d+$/.test(timestamp) ? Number(timestamp) : NaN;
    const now = Math.floor(Date.now() / 1000);
    if (Number.isNaN(sent) || Math.abs(now - sent) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  return { valid: true };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Infinite Giving webhook endpoint.
// express.raw with '*/*' keeps the exact bytes for any content type.
app.post('/webhooks/infinite-giving', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const result = verifyInfiniteGivingWebhook(
    rawBody,
    req.get('x-ig-timestamp'),
    req.get('x-ig-signature'),
    process.env.INFINITE_GIVING_WEBHOOK_SECRET,
    Number(process.env.INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS) || 0
  );

  if (!result.valid) {
    console.error(`Infinite Giving webhook verification failed: ${result.error}`);
    return res.status(401).send(result.error);
  }

  // Parse only after the signature check.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Dispatch on the body's `event` field. X-IG-Webhook-Id (same as payload.id)
  // is unique per delivery: use it to dedupe retries.
  const deliveryId = req.get('x-ig-webhook-id') || payload.id;
  const { event } = payload;
  const data = payload.data ?? {};

  switch (event) {
    case 'donation:created':
      console.log(
        `New ${data.type} donation ${data.id} (${data.identifier}, qty ${data.quantity}) ` +
          `for ${data.organization?.name}: status ${data.status} [${deliveryId}]`
      );
      break;

    case 'donation:updated':
      // There is no donation:completed event: completion is status "complete" here.
      if (data.status === 'complete') {
        console.log(`Donation ${data.id} complete, tax deductible: ${data.tax_deductible_amount} [${deliveryId}]`);
      } else if (data.status === 'canceled' || data.status === 'failed') {
        console.log(`Donation ${data.id} ${data.status}: ${data.cancelation_reason ?? 'no reason given'} [${deliveryId}]`);
      } else {
        console.log(`Donation ${data.id} updated, status ${data.status} [${deliveryId}]`);
      }
      break;

    default:
      console.log(`Unhandled Infinite Giving event: ${event} [${deliveryId}]`);
  }

  res.status(200).json({ received: true });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Infinite Giving webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/infinite-giving`);
    if (!process.env.INFINITE_GIVING_WEBHOOK_SECRET) {
      console.warn('Warning: INFINITE_GIVING_WEBHOOK_SECRET not set');
    }
  });
}

module.exports = { app, server, verifyInfiniteGivingWebhook };
