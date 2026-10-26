// Generated with: jazzhr-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// JazzHR signs the raw body with HMAC-SHA256 (bare hex) in X-JazzHR-Signature.
function verifySignature(rawBody, signatureHeader, secret) {
  // Check the hex first: Buffer.from(x, 'hex') silently truncates invalid input.
  if (!signatureHeader || !secret || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}

// Read the raw body for any content type so verification never depends on Content-Type.
app.post('/webhooks/jazzhr', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).send('Missing body');
  }

  if (!verifySignature(rawBody, req.get('X-JazzHR-Signature'), process.env.JAZZHR_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  // The event type is in a header, not the body.
  const eventType = req.get('X-JazzHR-Event');

  if (eventType === 'VERIFY') {
    // Signed setup POST sent when the integration is saved; only needs a 200.
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  switch (eventType) {
    case 'CANDIDATE-EXPORT':
      console.log('Candidate exported:', payload.candidate?.person?.id?.value, req.get('X-JazzHR-UUID'));
      break;
    default:
      console.log('Unhandled event:', eventType);
  }

  // Any 2xx acknowledges the delivery.
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
}

module.exports = app;
