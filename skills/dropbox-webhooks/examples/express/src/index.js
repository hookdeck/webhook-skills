// Generated with: dropbox-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// X-Dropbox-Signature is the hex HMAC-SHA256 of the raw body, keyed with the app secret
function verifySignature(rawBody, signature, appSecret) {
  if (!signature || !appSecret) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Verification request: Dropbox sends GET ?challenge=<value> when the URI is added.
// Echo it back as text/plain with nosniff.
app.get('/webhooks/dropbox', (req, res) => {
  const { challenge } = req.query;
  if (typeof challenge !== 'string') {
    return res.status(400).send('Missing challenge');
  }
  res
    .status(200)
    .set({ 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' })
    .send(challenge);
});

// Notifications: raw body is required for signature verification
app.post('/webhooks/dropbox', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('X-Dropbox-Signature');

  if (!verifySignature(req.body, signature, process.env.DROPBOX_APP_SECRET)) {
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Acknowledge quickly (Dropbox expects a response within 10 seconds), then process
  res.status(200).send('OK');

  // Dropbox sends change pings, not event types: fetch the changes with the API
  const accounts = (payload.list_folder && payload.list_folder.accounts) || [];
  for (const accountId of accounts) {
    setImmediate(() => processAccountChanges(accountId));
  }
});

// Call /files/list_folder/continue with the stored cursor for this account,
// save the new cursor, and repeat while has_more is true.
function processAccountChanges(accountId) {
  console.log(`Dropbox: list_folder changes for ${accountId}`);
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Dropbox webhook server listening on port ${port}`));
}

module.exports = app;
