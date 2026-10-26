// Generated with: proof-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Proof webhook signature.
 *
 * Proof sends the bare lowercase hex HMAC-SHA256 of the raw request body in the
 * `X-Notarize-Signature` header. The key is the API key that created the
 * subscription, or its `signing_key`. No timestamp is signed.
 *
 * @param {Buffer} rawBody - the raw, unparsed request body
 * @param {string} signatureHeader - the X-Notarize-Signature header value
 * @param {string} secret - the API key or signing_key (used as UTF-8 bytes)
 * @returns {boolean}
 */
function verifyProofSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  // Exactly 64 hex characters before any decoding (Buffer.from(x, 'hex') drops bad chars)
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex'); // 32 bytes, validated
  return crypto.timingSafeEqual(expected, received);
}

// Read the raw bytes for any content type so verification always sees them
app.post('/webhooks/proof', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-notarize-signature'];

  if (!signature) {
    return res.status(401).send('Missing X-Notarize-Signature header');
  }

  if (!Buffer.isBuffer(req.body) || !verifyProofSignature(req.body, signature, process.env.PROOF_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Signature is valid: now it is safe to parse the body
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  const data = payload.data || {};

  switch (payload.event) {
    case 'transaction.created':
      console.log('Transaction created:', data.transaction_id);
      // TODO: Record the transaction in your system
      break;

    case 'transaction.completed':
      console.log('Transaction completed:', data.transaction_id);
      // TODO: Update state. Documents may not be downloadable yet: wait for transaction.released
      break;

    case 'transaction.released':
      console.log('Transaction released:', data.transaction_id);
      // TODO: Fetch the signed documents from the Proof API
      break;

    case 'transaction.declined':
      console.log('Transaction declined:', data.transaction_id);
      // TODO: Notify the requester
      break;

    case 'notary.created':
      console.log('Notary created:', data.notary_id);
      // TODO: Sync the notary to your system
      break;

    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  // Only a 200 acknowledges; anything else is retried (up to 16 attempts over 48 hours).
  // Deliveries can repeat and arrive out of order, so keep handlers idempotent.
  res.status(200).json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helper for testing
module.exports = app;
module.exports.verifyProofSignature = verifyProofSignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/proof`);
  });
}
