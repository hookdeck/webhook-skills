// Generated with: nmi-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an NMI (Network Merchants) webhook.
 *
 * NMI does NOT use Standard Webhooks. Each delivery carries a single header:
 *
 *   Webhook-Signature: t=<nonce>,s=<lowercase-hex-hmac>
 *
 * IMPORTANT: NMI calls `t` a nonce and documents no replay/age window, so
 * don't parse it as a Unix time. The signature `s` is HMAC-SHA256 over "<nonce>.<raw_body>",
 * keyed with the webhooks signing key, hex-encoded (lowercase). We must hash the
 * raw, unparsed body — re-serializing the JSON would break the HMAC.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} signatureHeader - The Webhook-Signature header value
 * @param {string} signingKey - NMI webhooks signing key (Settings > Webhooks)
 * @returns {boolean} - Whether the signature is valid
 */
function verifyNmiWebhook(rawBody, signatureHeader, signingKey) {
  // Parse "t=<nonce>,s=<hex>" into { t, s }. Split each segment at the FIRST
  // '=' so a value containing '=' is preserved, and don't rely on ordering.
  const parts = {};
  for (const seg of String(signatureHeader || '').split(',')) {
    const i = seg.indexOf('=');
    if (i !== -1) {
      parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
    }
  }
  const nonce = parts.t;
  const signature = parts.s;

  // Fail closed on anything missing — including an unset signing key, so we
  // never throw an opaque 500 from createHmac(..., undefined).
  if (!nonce || !signature) {
    return false;
  }
  if (!signingKey) {
    console.error('NMI_SIGNING_KEY is not set — rejecting delivery');
    return false;
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${nonce}.${body}`)
    .digest('hex');

  // Timing-safe compare; wrap because mismatched lengths throw in Node.
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// NMI webhook endpoint — must use the raw body for verification.
app.post('/webhooks/nmi', express.raw({ type: '*/*' }), async (req, res) => {
  const signatureHeader = req.get('Webhook-Signature');
  if (!signatureHeader) {
    return res.status(400).send('Missing Webhook-Signature header');
  }

  // Verify before parsing.
  if (!verifyNmiWebhook(req.body, signatureHeader, process.env.NMI_SIGNING_KEY)) {
    console.error('Webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Safe to parse now that the signature checks out.
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const { event_id: eventId, event_type: eventType, event_body: eventBody } = event;
  console.log(`Received ${eventType} (event_id ${eventId})`);

  // Event names are dotted: transaction.<action>.<result>. Dispatch on the
  // action segment; return 200 quickly and do slow work asynchronously.
  const [, action] = String(eventType || '').split('.');
  switch (action) {
    case 'sale':
      // Your code: fulfil order / send receipt on success, dunning on failure
      break;

    case 'auth':
      // Your code: hold order while funds are authorized
      break;

    case 'capture':
      // Your code: mark order paid, fulfil
      break;

    case 'void':
      // Your code: release hold, cancel order
      break;

    case 'refund':
      // Your code: reverse fulfilment, notify customer
      break;

    case 'credit':
      // Your code: payout/adjustment bookkeeping
      break;

    case 'validate':
      // Your code: save card on file
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // `eventBody` carries the transaction/merchant details for this event.
  void eventBody;

  // Acknowledge quickly so NMI does not retry.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyNmiWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/nmi`);
  });
}
