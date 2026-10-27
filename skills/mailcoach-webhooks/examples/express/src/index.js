// Generated with: mailcoach-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Mailcoach: `Signature` = lowercase hex HMAC-SHA256 of the raw body, keyed with the
// webhook secret (UTF-8). No prefix, no timestamp.
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  // Validate the shape first: exactly 64 hex characters. Hex is case-insensitive.
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Both sides are 64 ASCII bytes, so timingSafeEqual cannot throw on length
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase(), 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}

// express.raw with '*/*' keeps the body as a Buffer for any content type
app.post('/webhooks/mailcoach', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('signature');

  if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, signature, process.env.MAILCOACH_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Missing or invalid Signature header' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is in the body (`event`); no header carries it
  switch (payload && payload.event) {
    case 'UnconfirmedSubscriberCreatedEvent':
      console.log(`Unconfirmed subscriber: ${payload.email} (list ${payload.email_list_uuid})`);
      // TODO: wait for SubscribedEvent before treating them as subscribed
      break;

    case 'SubscribedEvent':
      console.log(`Subscribed: ${payload.email} (list ${payload.email_list_uuid})`);
      // TODO: create or update the subscriber in your database
      break;

    case 'UnsubscribedEvent':
      console.log(`Unsubscribed: ${payload.email} (list ${payload.email_list_uuid})`);
      // TODO: mark the subscriber as unsubscribed
      break;

    case 'CampaignSentEvent':
      console.log(`Campaign sent: ${payload.name} to ${payload.sent_to_number_of_subscribers} subscribers`);
      // TODO: record the send and its statistics
      break;

    default:
      console.log('Unhandled event:', payload && payload.event);
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySignature = verifySignature;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}
