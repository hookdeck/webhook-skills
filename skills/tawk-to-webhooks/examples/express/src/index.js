// Generated with: tawk-to-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a tawk.to webhook: lowercase hex HMAC-SHA1 of the raw body,
 * keyed with the webhook secret, sent in X-Tawk-Signature.
 */
function verifyTawkSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// '*/*' reads the raw body whatever the Content-Type, so verification never depends on it
app.post('/webhooks/tawk-to', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-tawk-signature'];

  if (!signature) {
    return res.status(400).send('Missing X-Tawk-Signature header');
  }
  if (!Buffer.isBuffer(req.body) || !verifyTawkSignature(req.body, signature, process.env.TAWK_WEBHOOK_SECRET)) {
    console.error('tawk.to signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // X-Hook-Event-Id is stable across retries: use it for idempotency
  const eventId = req.headers['x-hook-event-id'];
  console.log(`Received ${payload.event} (event id: ${eventId})`);

  switch (payload.event) {
    case 'chat:start':
      console.log('Chat started:', payload.chatId, 'visitor:', payload.visitor?.name);
      break;
    case 'chat:end':
      console.log('Chat ended:', payload.chatId);
      break;
    case 'chat:transcript_created':
      console.log('Transcript created:', payload.chat?.id, 'messages:', payload.chat?.messages?.length);
      break;
    case 'ticket:create':
      console.log('Ticket created:', payload.ticket?.id, payload.ticket?.subject);
      break;
    default:
      console.log('Unhandled event:', payload.event);
  }

  res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`tawk.to webhook server listening on port ${PORT}`));
}

module.exports = { app, verifyTawkSignature };
