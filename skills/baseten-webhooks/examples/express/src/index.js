// Generated with: baseten-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// X-BASETEN-SIGNATURE: v1=<hex>. HMAC-SHA256 of the raw body bytes, keyed with
// the secret's UTF-8 bytes. Nothing else is signed, so there is no timestamp
// window. During rotation the header may hold several comma-separated values.
function verifyBasetenSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return header.split(',').some((part) => {
    const sig = part.trim().replace(/^v1=/, '');
    // Validate length and alphabet before decoding: Buffer.from(.., 'hex')
    // silently drops invalid characters.
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
  });
}

// Success and failure share the same event type; `data` and `errors` tell them apart.
function handleAsyncRequestCompleted(event) {
  const failed = !event.data || (Array.isArray(event.errors) && event.errors.length > 0);
  if (failed) {
    console.log(`Async request ${event.request_id} failed:`, JSON.stringify(event.errors));
    return 'failed';
  }
  console.log(`Async request ${event.request_id} completed for model ${event.model_id}`);
  return 'succeeded';
}

// express.raw with '*/*' keeps the exact bytes whatever the content type is
app.post('/webhooks/baseten', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BASETEN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BASETEN_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('x-baseten-signature');
  if (!signature) {
    return res.status(401).json({ error: 'Missing X-BASETEN-SIGNATURE header' });
  }

  // Express 5 leaves req.body undefined when there is no body
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyBasetenSignature(rawBody, signature, secret)) {
    console.error('Baseten signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse only after the signature is verified
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  switch (event.type) {
    case 'async_request_completed':
      return res.json({ received: true, outcome: handleAsyncRequestCompleted(event) });
    default:
      console.log(`Unhandled Baseten event type: ${event.type}`);
      return res.json({ received: true, outcome: 'ignored' });
  }
});

module.exports = { app, verifyBasetenSignature };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Baseten webhook server listening on port ${port}`));
}
