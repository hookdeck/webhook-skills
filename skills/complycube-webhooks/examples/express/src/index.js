// Generated with: complycube-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a ComplyCube webhook signature.
 *
 * ComplyCube sends `ComplyCube-Signature: <hex>` (no prefix): the lowercase hex HMAC-SHA256 of the
 * raw request body bytes, keyed with the webhook's secret. Nothing else is signed.
 */
function verifyComplyCubeSignature(rawBody, signatureHeader, secret) {
  // Check the hex shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (typeof signatureHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}

// Read the raw body for ANY content type so the signature covers the exact bytes received.
app.post('/webhooks/complycube', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.COMPLYCUBE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('COMPLYCUBE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['complycube-signature'];

  if (!verifyComplyCubeSignature(rawBody, signature, secret)) {
    console.error('ComplyCube webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (typeof event !== 'object' || event === null || typeof event.type !== 'string') {
    return res.status(400).send('Invalid event');
  }

  // event.id is stable across retries: use it for idempotency (duplicates and reordering happen)
  switch (event.type) {
    case 'check.completed':
      console.log(`Check ${event.payload?.id} completed (any outcome) [event ${event.id}]`);
      break;
    case 'check.completed.clear':
    case 'check.completed.attention':
    case 'check.completed.rejected':
    case 'check.completed.match_confirmed':
      console.log(`Check ${event.payload?.id} outcome: ${event.type.split('.')[2]} [event ${event.id}]`);
      break;
    case 'check.failed':
      console.log(`Check ${event.payload?.id} failed [event ${event.id}]`);
      break;
    case 'client.created':
      console.log(`Client ${event.payload?.id} created [event ${event.id}]`);
      break;
    case 'workflow.session.completed':
      console.log(`Workflow session ${event.payload?.id} completed [event ${event.id}]`);
      break;
    default:
      console.log(`Unhandled ComplyCube event: ${event.type} [event ${event.id}]`);
  }

  // Acknowledge with a 20x within 15 seconds, or ComplyCube retries and eventually disables the webhook
  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`ComplyCube webhook server listening on port ${port}`));
}

module.exports = { app, verifyComplyCubeSignature };
