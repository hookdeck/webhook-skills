// Generated with: favro-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Favro webhook.
 *
 * Favro does NOT use Standard Webhooks. The signature is in the
 * `X-Favro-Webhook` header and is computed over `payloadId + webhookUrl` —
 * NOT the request body:
 *
 *   X-Favro-Webhook = base64( HMAC-SHA1( secret, payloadId + webhookUrl ) )
 *
 * - payloadId  : the top-level string in the JSON body.
 * - webhookUrl : the postToUrl you registered, verbatim (FAVRO_WEBHOOK_URL).
 *
 * @param {string} payloadId  - payloadId from the request body
 * @param {string} webhookUrl - the URL registered with Favro, byte-identical
 * @param {string} secret     - the webhook secret you set at creation
 * @param {string} signature  - the X-Favro-Webhook header value
 * @returns {boolean}
 */
function verifyFavroWebhook(payloadId, webhookUrl, secret, signature) {
  if (!payloadId || !webhookUrl || !secret || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', secret)
    .update(payloadId + webhookUrl, 'utf8')
    .digest('base64');

  // Timing-safe compare; guard against length mismatch throwing.
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Derive a `<type>.<action>` event key from a Favro payload. Favro reuses the
 * same `action` across object types, so the type comes from which object the
 * payload carries. Comment events carry the `card` too, so check `comment` first.
 */
function eventKey(body) {
  if (body.action === 'ping') {
    return 'ping';
  }
  const type = body.comment ? 'comment' : body.card ? 'card' : 'unknown';
  return `${type}.${body.action}`;
}

// The signature is over payloadId + URL, not the body, so we don't need the raw
// body — parsing JSON up front is fine.
app.post('/webhooks/favro', express.json({ type: () => true }), (req, res) => {
  const signature = req.get('X-Favro-Webhook');
  const body = req.body || {};

  // Verify before trusting anything in the payload.
  if (
    !verifyFavroWebhook(
      body.payloadId,
      process.env.FAVRO_WEBHOOK_URL,
      process.env.FAVRO_WEBHOOK_SECRET,
      signature
    )
  ) {
    console.error('Webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  const event = eventKey(body);

  // The setup ping validates the endpoint — just acknowledge it.
  if (event === 'ping') {
    console.log('Received Favro setup ping — endpoint validated');
    return res.status(200).send('OK');
  }

  console.log(`Received ${event} (payloadId ${body.payloadId})`);

  // Dispatch on the event. Return 200 quickly; do slow work asynchronously.
  switch (event) {
    case 'card.created':
      // Your code: sync the new card
      break;
    case 'card.committed':
      // Your code: handle a card committed to this widget
      break;
    case 'card.moved':
      // Your code: react to the card's new column
      break;
    case 'card.updated':
      // Your code: keep your copy of the card in sync
      break;
    case 'card.deleted':
      // Your code: remove your copy of the card
      break;
    case 'comment.created':
      // Your code: handle the new comment
      break;
    case 'comment.updated':
      // Your code: sync the edited comment
      break;
    case 'comment.deleted':
      // Your code: remove your copy of the comment
      break;
    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Favro expects a 200 for every event; repeated failures disable the webhook.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyFavroWebhook, eventKey };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/favro`);
  });
}
