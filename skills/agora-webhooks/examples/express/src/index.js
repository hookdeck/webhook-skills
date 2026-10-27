// Generated with: agora-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Agora webhook signature.
 * Agora-Signature is the bare lowercase hex HMAC-SHA1 of the raw request body
 * (key = the Signing Secret as UTF-8 bytes). Nothing else is signed.
 * @param {Buffer} rawBody - Raw request body, exactly as received
 * @param {string|undefined} signature - Agora-Signature header value
 * @param {string|undefined} secret - Signing Secret from Agora Console
 * @returns {boolean}
 */
function verifyAgoraWebhook(rawBody, signature, secret) {
  if (!signature || !secret) return false;

  // Validate format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-fA-F]{40}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// express.raw with '*/*' keeps the body as a Buffer whatever the Content-Type
app.post('/webhooks/agora', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('agora-signature');

  if (!Buffer.isBuffer(req.body) || !verifyAgoraWebhook(req.body, signature, process.env.AGORA_WEBHOOK_SECRET)) {
    console.error('Agora webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse the payload only after verification
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // eventType is a JSON number; productId (1 = RTC) scopes the code space
  const { productId, eventType, noticeId, payload = {} } = event;
  console.log(`Received productId=${productId} eventType=${eventType} noticeId=${noticeId}`);

  if (productId === 1) {
    switch (String(eventType)) {
      case '101':
        console.log(`Channel created: ${payload.channelName}`);
        break;
      case '102':
        console.log(`Channel destroyed: ${payload.channelName}`);
        break;
      case '103':
        console.log(`Broadcaster joined ${payload.channelName}: uid ${payload.uid}`);
        break;
      case '104':
        console.log(`Broadcaster left ${payload.channelName}: uid ${payload.uid}`);
        break;
      default:
        console.log(`Unhandled RTC event: ${eventType}`);
    }
  } else {
    console.log(`Unhandled product ${productId} event: ${eventType}`);
  }

  // Agora wants a 200 with a JSON body within 10 seconds; duplicates happen, so dedupe on noticeId
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyAgoraWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/agora`);
  });
}
