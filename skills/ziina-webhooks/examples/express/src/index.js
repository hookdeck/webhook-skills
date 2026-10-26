// Generated with: ziina-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Ziina webhook signature.
 *
 * X-Hmac-Signature is the bare lowercase hex HMAC-SHA256 of the raw request body,
 * keyed with the secret's UTF-8 bytes. Nothing else is signed.
 */
function verifyZiinaWebhook(rawBody, signatureHeader, secret) {
  // Validate the format before decoding: exactly 64 hex characters.
  if (!secret || typeof signatureHeader !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Raw body for any content type, so the exact bytes are verified.
app.post('/webhooks/ziina', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyZiinaWebhook(rawBody, req.headers['x-hmac-signature'], process.env.ZIINA_WEBHOOK_SECRET)) {
    console.error('Ziina signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // The event name does not change with the status; the new state is in data.status.
  const status = payload.data?.status;
  switch (payload.event) {
    case 'payment_intent.status.updated':
      console.log(`Payment intent ${payload.data?.id} is now ${status}`);
      // TODO: if status is 'completed', mark the order paid.
      break;
    case 'refund.status.updated':
      console.log(`Refund ${payload.data?.id} is now ${status}`);
      // TODO: update the refund state in your system.
      break;
    default:
      console.log(`Unhandled Ziina event: ${payload.event}`);
  }

  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyZiinaWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ziina`);
  });
}
