require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a WAHA webhook signature.
 *
 * WAHA sends X-Webhook-Hmac = hex(HMAC-SHA512(key, rawBody)) where the key is
 * used as a UTF-8 string, plus X-Webhook-Hmac-Algorithm: sha512.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - X-Webhook-Hmac header value
 * @param {string|undefined} secret - hmac.key from the session webhook config
 * @param {string} [algorithm] - X-Webhook-Hmac-Algorithm header value
 * @returns {boolean} - Whether the signature is valid
 */
function verifyWahaSignature(rawBody, signature, secret, algorithm = 'sha512') {
  if (!signature || !secret) {
    return false;
  }
  // WAHA documents sha512 only; reject anything else rather than guess
  if (String(algorithm).toLowerCase() !== 'sha512') {
    return false;
  }

  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Handle a verified WAHA event, dispatching on the envelope's `event` field.
 */
function handleWahaEvent(event) {
  const { payload } = event;
  switch (event.event) {
    case 'message':
      console.log(`Incoming message from ${payload?.from}: ${payload?.body}`);
      // TODO: Route to your bot / inbox logic
      break;

    case 'message.any':
      console.log(`Message (any direction) ${payload?.id}, fromMe=${payload?.fromMe}`);
      // TODO: Mirror the full conversation, including messages you sent
      break;

    case 'message.ack':
      console.log(`Message ${payload?.id} ack: ${payload?.ackName} (${payload?.ack})`);
      // TODO: Update delivery/read status
      break;

    case 'message.reaction':
      console.log(`Reaction on ${payload?.reaction?.messageId}: ${payload?.reaction?.text}`);
      // TODO: Store the reaction
      break;

    case 'session.status':
      console.log(`Session ${event.session} status: ${payload?.status}`);
      // TODO: On SCAN_QR_CODE fetch the QR; alert on FAILED / STOPPED
      break;

    case 'group.v2.join':
      console.log(`Joined group ${payload?.group?.subject} (${payload?.group?.id})`);
      // TODO: Register the group
      break;

    case 'presence.update':
      console.log(`Presence in chat ${payload?.id}:`, payload?.presences);
      // TODO: Update online/typing state
      break;

    default:
      console.log(`Unhandled WAHA event: ${event.event}`);
  }
}

// WAHA webhook endpoint - raw body for signature verification, any content type
app.post('/webhooks/waha',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.WAHA_WEBHOOK_HMAC_KEY;
    if (!secret) {
      console.error('WAHA_WEBHOOK_HMAC_KEY is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-webhook-hmac'];
    if (!signature) {
      return res.status(400).send('Missing X-Webhook-Hmac header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const algorithm = req.headers['x-webhook-hmac-algorithm'] || 'sha512';
    if (!verifyWahaSignature(rawBody, signature, secret, algorithm)) {
      console.error('WAHA webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Retries resend the same event: de-duplicate on event.id (evt_...)
    // or the X-Webhook-Request-Id header.
    handleWahaEvent(event);

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyWahaSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/waha`);
  });
}
