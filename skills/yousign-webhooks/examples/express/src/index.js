// Generated with: yousign-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Yousign signs the raw body: X-Yousign-Signature-256 = "sha256=" + hex(HMAC-SHA256(secret, rawBody))
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// express.raw with '*/*' keeps the body as a Buffer for any content type
app.post('/webhooks/yousign', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-yousign-signature-256');

  if (!signature) {
    return res.status(400).send('Missing X-Yousign-Signature-256 header');
  }
  if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, signature, process.env.YOUSIGN_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // event_id is globally unique: use it to deduplicate retries (x-yousign-retry > 0)
  switch (event.event_name) {
    case 'signature_request.activated':
      console.log('Signature request activated:', event.data?.signature_request?.id);
      break;
    case 'signature_request.done':
      console.log('Signature request done:', event.data?.signature_request?.id);
      break;
    case 'signature_request.declined':
      console.log('Signature request declined:', event.data?.signature_request?.id);
      break;
    case 'signer.done':
      console.log('Signer done:', event.data?.signer?.id);
      break;
    case 'signer.declined':
      console.log('Signer declined:', event.data?.signer?.id);
      break;
    default:
      console.log('Unhandled event:', event.event_name);
  }

  // Respond 2xx within 1 second; do heavy work asynchronously
  res.json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = app;
