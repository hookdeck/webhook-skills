require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a TextUs webhook signature.
 *
 * TextUs sends `X-TextUs-Signature: <64 hex chars>`, the HMAC-SHA256 of the raw
 * request body keyed with the webhook secret (the whole `textus-...` string).
 * There is no official verification SDK, so we verify manually with `crypto`.
 */
function verifyTextUsSignature(rawBody, header, secret) {
  // Validate hex first: Buffer.from(x, 'hex') silently truncates invalid input.
  if (!secret || typeof header !== 'string' || !/^[0-9a-f]{64}$/i.test(header)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
}

// express.raw with '*/*' hands us the untouched bytes whatever the content type.
app.post('/webhooks/textus', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-textus-signature'];

  if (!verifyTextUsSignature(rawBody, signature, process.env.TEXTUS_WEBHOOK_SECRET)) {
    console.error('TextUs webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event name is in `action`.
  switch (event.action) {
    case 'message.received':
      console.log('Message received:', event.message?.id);
      // TODO: Route the reply to your CRM or support queue.
      break;

    case 'message.delivered':
      console.log('Message delivered:', event.message?.id);
      // TODO: Mark the outgoing message as delivered.
      break;

    case 'message.failed':
    case 'message.unknown':
      console.log(`Message problem (${event.action}):`, event.message?.id);
      // TODO: Alert or retry through another channel.
      break;

    case 'phone_call.completed':
      console.log('Phone call completed');
      // TODO: Log the call against the contact.
      break;

    case 'contact.opted_out':
      console.log('Contact opted out:', event.optOut);
      // TODO: Suppress this number in your systems.
      break;

    case 'contact.opted_in':
      console.log('Contact opted in:', event.optOut);
      // TODO: Re-enable messaging for this number.
      break;

    case 'contact.created':
      console.log('Contact created:', event.contact?.id);
      // TODO: Sync the new contact.
      break;

    default:
      console.log(`Unhandled event: ${event.action}`);
  }

  // Any 2xx acknowledges receipt; other 4xx/5xx pause the integration.
  res.json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/textus`);
  });
}
