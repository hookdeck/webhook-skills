require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the `signature` header: hex(HMAC-SHA256(rawBody, webhookSharedSecret)).
 * The secret is the app's webhook shared secret, not the OAuth client secret.
 */
function verifyZenefitsSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) return false;
  // Buffer.from(x, 'hex') silently truncates invalid hex, so check the format first
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}

// Raw body is required: the signature covers the exact bytes Zenefits sent.
// type '*/*' makes the raw parser (and so verification) work for any content type.
app.post('/webhooks/zenefits', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const signature = req.headers['signature'];
  if (!signature) {
    return res.status(401).send('Missing signature header');
  }
  if (!verifyZenefitsSignature(rawBody, signature, process.env.ZENEFITS_WEBHOOK_SECRET)) {
    console.error('Zenefits webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event name is the "type" field; "data" matches the REST API for the object
  switch (event.type) {
    case 'companies.did_change':
      console.log('Company changed:', event.data);
      break;
    case 'people.did_create':
      console.log('Person created:', event.data);
      break;
    case 'people.did_change':
      console.log('Person changed:', event.data);
      break;
    case 'employments.did_start':
      console.log('Employment started:', event.data);
      break;
    case 'employments.did_terminate':
      console.log('Employment terminated:', event.data);
      break;
    case 'flow.did_complete.hiring':
      console.log('Hiring flow completed:', event.data);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  // Any 2xx acknowledges receipt; Zenefits retries non-2xx for up to 1 hour
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = { app, verifyZenefitsSignature };
