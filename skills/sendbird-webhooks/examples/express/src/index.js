require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the x-sendbird-signature header.
 * Sendbird sends the hex HMAC-SHA256 of the raw request body, keyed with the
 * application's MASTER API token.
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - x-sendbird-signature header value
 * @param {string} apiToken - Sendbird master API token
 * @returns {boolean}
 */
function verifySendbirdWebhook(rawBody, signatureHeader, apiToken) {
  if (!signatureHeader || !apiToken) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', apiToken)
    .update(rawBody)
    .digest('hex');

  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual throws on length mismatch, so check first
  return (
    received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf)
  );
}

// Sendbird webhook endpoint. express.raw with type '*/*' keeps the exact bytes
// for any content type, which is what the signature is computed over.
app.post('/webhooks/sendbird',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const apiToken = process.env.SENDBIRD_API_TOKEN;
    if (!apiToken) {
      console.error('SENDBIRD_API_TOKEN is not set');
      return res.status(500).send('Webhook not configured');
    }

    const signature = req.headers['x-sendbird-signature'];
    if (!signature) {
      return res.status(400).send('Missing x-sendbird-signature header');
    }

    if (!Buffer.isBuffer(req.body) || !verifySendbirdWebhook(req.body, signature, apiToken)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const category = payload.category;
    console.log(`Received ${category} event`);

    switch (category) {
      case 'group_channel:message_send':
        console.log(`Group message from ${payload.sender?.user_id} in ${payload.channel?.channel_url}:`, payload.payload?.message);
        // TODO: Offline push, SMS/email notification, moderation, etc.
        break;

      case 'group_channel:create':
        console.log(`Group channel created: ${payload.channel?.channel_url}`);
        break;

      case 'group_channel:join':
        console.log(`User joined group channel: ${payload.channel?.channel_url}`);
        break;

      case 'group_channel:leave':
        console.log(`User left group channel: ${payload.channel?.channel_url}`);
        break;

      case 'open_channel:message_send':
        console.log(`Open channel message from ${payload.sender?.user_id} in ${payload.channel?.channel_url}:`, payload.payload?.message);
        break;

      case 'user:block':
        console.log('User blocked another user');
        // TODO: Update your own block lists, audit log, etc.
        break;

      case 'user:unblock':
        console.log('User unblocked another user');
        break;

      default:
        console.log(`Unhandled event: ${category}`);
    }

    // Respond quickly: Sendbird waits 5 seconds and retries up to 3 times
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifySendbirdWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sendbird`);
  });
}
