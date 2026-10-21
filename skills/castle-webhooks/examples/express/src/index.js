require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Castle webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Castle-Signature header (base64 HMAC-SHA256)
 * @param {string} secret - Castle API secret
 * @returns {boolean}
 */
function verifyCastleSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Castle webhook endpoint - must use raw body for signature verification
app.post('/webhooks/castle',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-castle-signature'];

    if (!verifyCastleSignature(req.body, signature, process.env.CASTLE_API_SECRET)) {
      console.error('Castle signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The event name is in the body's `type` field
    switch (event.type) {
      case '$policy.matched':
        console.log(`Policy matched: ${event.data?.policy?.name} (action: ${event.data?.policy?.action})`);
        // TODO: suspend account, queue for review, etc.
        break;

      case '$list_item.created':
        console.log(`List item created: ${event.data?.primary_value}`);
        // TODO: sync to your blocklist/allowlist
        break;

      case '$list_item.archived':
        console.log(`List item archived: ${event.data?.primary_value}`);
        // TODO: remove from your blocklist/allowlist
        break;

      case '$list_item.unarchived':
        console.log(`List item unarchived: ${event.data?.primary_value}`);
        // TODO: re-add to your blocklist/allowlist
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Any 2xx acknowledges receipt; non-2xx is retried
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyCastleSignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/castle`);
  });
}
