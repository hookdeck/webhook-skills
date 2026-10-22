require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Checkly signs the rendered body with HMAC-SHA256 and sends the hex digest.
function verifyChecklySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

// The body is a user-defined template, so read raw bytes for any content type.
app.post('/webhooks/checkly', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-checkly-signature');
  if (!signature) {
    return res.status(400).send('Missing x-checkly-signature header');
  }

  if (!Buffer.isBuffer(req.body) || !verifyChecklySignature(req.body, signature, process.env.CHECKLY_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // alertType, checkName and checkId come from your Checkly body template.
  switch (payload.alertType) {
    case 'ALERT_FAILURE':
      console.log(`Check failed: ${payload.checkName} (${payload.checkId})`);
      break;
    case 'ALERT_RECOVERY':
      console.log(`Check recovered: ${payload.checkName} (${payload.checkId})`);
      break;
    case 'ALERT_DEGRADED':
      console.log(`Check degraded: ${payload.checkName} (${payload.checkId})`);
      break;
    default:
      console.log(`Unhandled alert type: ${payload.alertType}`);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = app;
