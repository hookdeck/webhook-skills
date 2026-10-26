// Generated with: onramper-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Onramper signs the raw body: X-Onramper-Webhook-Signature is the bare lowercase hex
 * HMAC-SHA256 of the body, keyed with the secret's UTF-8 bytes. Nothing else is signed,
 * so there is no timestamp window to check.
 */
function verifyOnramperSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false; // exact length and alphabet first
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated: 32 bytes
  return crypto.timingSafeEqual(received, expected);
}

/**
 * Every delivery is a transaction snapshot with no event name, so dispatch on `status`.
 * `transactionType` (buy | offramp) gives the direction.
 */
function handleEvent(tx) {
  const ref = `${tx.transactionId} (${tx.transactionType})`;
  switch (tx.status) {
    case 'completed':
      console.log(`Transaction completed: ${ref}`);
      // TODO: fulfil the order using tx.outAmount, tx.targetCurrency, tx.transactionHash
      break;

    case 'paid':
      console.log(`Transaction paid: ${ref}`);
      break;

    case 'pending':
      console.log(`Transaction pending: ${ref}`);
      break;

    case 'new':
      console.log(`Transaction created: ${ref}`);
      break;

    case 'failed':
      console.log(`Transaction failed: ${ref}`);
      // TODO: notify the customer or alert support
      break;

    case 'canceled':
      console.log(`Transaction canceled: ${ref}`);
      break;

    default:
      console.log(`Unhandled status: ${tx.status} (${ref})`);
  }
}

// Raw body, any content type: the exact bytes are what gets verified.
app.post('/webhooks/onramper', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-onramper-webhook-signature'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!signature) {
    return res.status(401).json({ error: 'Missing signature header' });
  }
  if (!verifyOnramperSignature(rawBody, signature, process.env.ONRAMPER_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse only after the signature check.
  let tx;
  try {
    tx = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (tx === null || typeof tx !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    handleEvent(tx);
  } catch (err) {
    console.error('Error handling Onramper webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyOnramperSignature = verifyOnramperSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/onramper`);
  });
}
