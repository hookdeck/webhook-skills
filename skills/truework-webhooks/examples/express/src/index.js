// Generated with: truework-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

// Receiver for Truework webhooks (order.completed, verification_request.state.change).
//
// Truework does NOT sign the payload: there is no HMAC and no signature header.
// Each webhook has an authentication token (Developer Settings > Webhooks) that
// Truework sends raw in the X-Truework-Token header. Reject any request whose
// token does not match, comparing in constant time.

const TOKEN_HEADER = 'x-truework-token';

// Read config per request so tests (and token rotation) don't need a restart.
function configuredToken() {
  return process.env.TRUEWORK_WEBHOOK_TOKEN || '';
}

// Constant-time string compare. Hashing both sides first gives equal-length
// buffers, so timingSafeEqual never throws and the token's length isn't leaked.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Check the X-Truework-Token header against the configured webhook token.
 * @returns {boolean|null} null when no token is configured (caller fails closed)
 */
function verifyTrueworkToken(headerValue, token = configuredToken()) {
  if (!token) return null;
  return safeEqual(headerValue, token);
}

/**
 * Handle one webhook. Payload shape (from Truework's docs):
 *   { version, hook: { id, event, target }, data: { order_id, ... } }
 * Webhooks can be delivered more than once, so handlers must be idempotent.
 */
function handleTrueworkEvent(payload) {
  const event = payload && payload.hook && payload.hook.event;
  const data = (payload && payload.data) || {};

  switch (event) {
    case 'order.completed':
      // All verifications on the order are completed or canceled: fetch results from the API.
      console.log(`Truework order completed: ${data.order_id}`);
      break;
    case 'verification_request.state.change':
      // state: pending-approval | processing | action-required | completed | canceled | invalid
      console.log(
        `Truework verification request ${data.verification_request_id} on order ${data.order_id} -> ${data.state}`
      );
      break;
    default:
      console.log(`Unhandled Truework event: ${event}`);
  }
  return event;
}

const app = express();

app.post(
  '/webhooks/truework',
  // Read every content type as raw bytes so the body is never parsed before auth.
  express.raw({ type: '*/*' }),
  (req, res) => {
    const result = verifyTrueworkToken(req.get(TOKEN_HEADER));
    if (result === null) {
      console.error('Truework webhook refused: TRUEWORK_WEBHOOK_TOKEN is not set');
      return res.status(500).json({ error: 'Webhook authentication not configured' });
    }
    if (!result) {
      return res.status(401).json({ error: 'Invalid or missing X-Truework-Token' });
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const event = handleTrueworkEvent(payload);
    res.status(200).json({ received: true, event });
  }
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = { app, verifyTrueworkToken, safeEqual, handleTrueworkEvent };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/truework`);
  });
}
