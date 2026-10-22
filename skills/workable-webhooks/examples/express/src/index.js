// Generated with: workable-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Workable signs the raw body with HMAC-SHA256 (hex) in X-Workable-Signature.
// The key is the API token that created the subscription (or the OAuth app secret).
function verifySignature(rawBody, signatureHeader, key) {
  if (!signatureHeader || !key) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader.toLowerCase()), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Read the raw body for any content type so verification never depends on Content-Type.
app.post('/webhooks/workable', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).send('Missing body');
  }

  const signature = req.get('X-Workable-Signature');
  if (!signature) {
    return res.status(400).send('Missing X-Workable-Signature header');
  }
  if (!verifySignature(rawBody, signature, process.env.WORKABLE_SIGNING_KEY)) {
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const eventType = payload.event_type || payload.event;
  switch (eventType) {
    case 'candidate_created':
      console.log('Candidate created:', payload.id);
      break;
    case 'candidate_moved':
      console.log('Candidate moved:', payload.id);
      break;
    case 'employee_created':
      console.log('Employee created:', payload.id);
      break;
    case 'employee_updated':
      console.log('Employee updated:', payload.id);
      break;
    case 'employee_published':
      console.log('Employee published:', payload.id);
      break;
    default:
      console.log('Unhandled event:', eventType);
  }

  // Workable replays the request unless the response is 200.
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
}

module.exports = app;
