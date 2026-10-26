require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Simpro webhook signature.
 *
 * X-Response-Signature = lowercase hex HMAC-SHA1 of the raw body, keyed with the
 * subscription Secret. No prefix and no timestamp.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - X-Response-Signature header value
 * @param {string|undefined} secret - Secret from the Simpro webhook subscription
 * @returns {boolean} - Whether the signature is valid
 */
function verifySimproSignature(rawBody, signature, secret) {
  // Exactly 40 hex chars: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!signature || !secret || !/^[0-9a-fA-F]{40}$/.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

/**
 * Handle a Simpro event, dispatching on its `ID`.
 * `reference` holds the ids needed to fetch the record from the Simpro API.
 */
function handleSimproEvent(event) {
  switch (event.ID) {
    case 'job.created':
      console.log(`Job created: ${event.description}`, event.reference);
      // TODO: Fetch the job via the Simpro API and sync it
      break;

    case 'company.customer.updated':
      console.log(`Customer updated: ${event.description}`, event.reference);
      // TODO: Fetch the customer and update your CRM
      break;

    case 'invoice.created':
      console.log(`Invoice created: ${event.description}`, event.reference);
      // TODO: Push to accounting
      break;

    case 'quote.updated':
      console.log(`Quote updated: ${event.description}`, event.reference);
      // TODO: Track quote status
      break;

    case 'employee.deleted':
      console.log(`Employee deleted: ${event.description}`, event.reference);
      // TODO: Revoke access in connected systems
      break;

    case 'test.updated':
      console.log('Simpro test subscription received');
      break;

    default:
      console.log(`Unhandled Simpro event: ${event.ID}`);
  }
}

// Simpro webhook endpoint - raw body of any content type for signature verification
app.post('/webhooks/simpro',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SIMPRO_WEBHOOK_SECRET;
    if (!secret) {
      console.error('SIMPRO_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-response-signature'];
    if (!signature) {
      return res.status(401).send('Missing X-Response-Signature header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifySimproSignature(rawBody, signature, secret)) {
      console.error('Simpro webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    handleSimproEvent(event);

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifySimproSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/simpro`);
  });
}
