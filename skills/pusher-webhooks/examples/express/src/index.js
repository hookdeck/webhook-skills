// Generated with: pusher-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const Pusher = require('pusher');

const app = express();

function pusherClient() {
  return new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_APP_KEY,
    secret: process.env.PUSHER_APP_SECRET,
    cluster: process.env.PUSHER_CLUSTER || 'mt1',
  });
}

// Pusher webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/pusher',
  express.raw({ type: '*/*' }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).send('Missing body');
    }

    // The SDK throws on a missing signature, so reject absent headers first
    if (!req.headers['x-pusher-key'] || !req.headers['x-pusher-signature']) {
      return res.status(400).send('Missing Pusher signature headers');
    }

    // The SDK checks X-Pusher-Key, HMAC-SHA256 of the raw body (X-Pusher-Signature)
    // and that the content type is application/json. Express lower-cases header names.
    const webhook = pusherClient().webhook({
      headers: req.headers,
      rawBody: req.body.toString('utf8'),
    });

    if (!webhook.isValid()) {
      console.error('Pusher webhook verification failed');
      return res.status(400).send('Invalid signature');
    }

    // With batch webhooks enabled, one request can carry many events
    for (const event of webhook.getEvents()) {
      switch (event.name) {
        case 'channel_occupied':
          console.log(`Channel occupied: ${event.channel}`);
          break;
        case 'channel_vacated':
          console.log(`Channel vacated: ${event.channel}`);
          break;
        case 'member_added':
          console.log(`Member ${event.user_id} joined ${event.channel}`);
          break;
        case 'member_removed':
          console.log(`Member ${event.user_id} left ${event.channel}`);
          break;
        case 'client_event':
          console.log(`Client event ${event.event} on ${event.channel} from ${event.socket_id}`);
          break;
        case 'cache_miss':
          console.log(`Cache miss on ${event.channel}`);
          break;
        case 'subscription_count':
          console.log(`Subscription count on ${event.channel}: ${event.subscription_count}`);
          break;
        default:
          console.log(`Unhandled Pusher event: ${event.name}`);
      }
    }

    res.json({ received: true });
  }
);

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Pusher webhook server listening on http://localhost:${port}`);
    console.log(`Webhook endpoint: POST http://localhost:${port}/webhooks/pusher`);
  });
}

module.exports = app;
