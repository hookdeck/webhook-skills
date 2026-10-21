require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the Bob-Signature header: base64(HMAC-SHA512(rawBody, secret)).
 * The secret is the raw string shown in the Bob webhook configuration.
 */
function verifyBobSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Bob sends "Ping test" (plain text) or {"text":"Ping test"} when a webhook is added
function isPing(rawBody) {
  const text = rawBody.toString('utf8').trim();
  if (text === 'Ping test') return true;
  try {
    return JSON.parse(text).text === 'Ping test';
  } catch {
    return false;
  }
}

// Raw body is required: the signature covers the exact bytes Bob sent
app.post('/webhooks/hibob', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Answer the connection test immediately with 200
  if (isPing(rawBody)) {
    return res.status(200).send('OK');
  }

  const signature = req.headers['bob-signature'];
  if (!signature) {
    return res.status(400).send('Missing Bob-Signature header');
  }
  if (!verifyBobSignature(rawBody, signature, process.env.HIBOB_WEBHOOK_SECRET)) {
    console.error('Bob webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event name is the "type" field; payloads carry IDs, fetch details via Bob's API
  switch (event.type) {
    case 'employee.created':
      console.log('Employee created:', event.data);
      break;
    case 'employee.updated':
      console.log('Employee updated:', event.data);
      break;
    case 'employee.joined':
      console.log('Employee joined:', event.data);
      break;
    case 'employee.left':
      console.log('Employee left:', event.data);
      break;
    case 'timeoff.request.requested':
      console.log('Time off requested:', event.data);
      break;
    case 'timeoff.request.approved':
      console.log('Time off approved:', event.data);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = { app, verifyBobSignature };
