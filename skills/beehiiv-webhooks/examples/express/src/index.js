// Generated with: beehiiv-webhooks skill
// https://github.com/hookdeck/webhook-skills

import dotenv from 'dotenv';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// beehiiv delivers webhooks through Svix:
//   svix-id         unique message ID (same on retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify a beehiiv delivery with the official `svix` library and return the parsed event.
 *
 * The library always enforces a 5-minute timestamp window. Hookdeck retries and replays
 * resend the original svix-timestamp, so they are rejected once they are older than that.
 * references/verification.md has a manual verifier where the window can be dropped or widened.
 *
 * @param {Buffer|string} rawBody - the exact bytes beehiiv sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @throws {Error} if the signature or timestamp is invalid
 */
export function verifyBeehiivWebhook(rawBody, headers, secret = process.env.BEEHIIV_WEBHOOK_SECRET) {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  new Webhook(secret).verify(body, headers); // throws on failure; 2.x returns nothing
  return JSON.parse(body); // parse only after the signature check
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The envelope has a `uid`, which is stable across retries.
const processedEventIds = new Set();

function handleEvent(event) {
  const { event_type: type, data = {} } = event;

  switch (type) {
    case 'post.sent':
    case 'post.updated':
    case 'post.scheduled':
      console.log(`${type}: post ${data.id ?? data.post_id ?? '(unknown id)'}`);
      break;
    case 'subscription.created':
    case 'subscription.confirmed':
    case 'subscription.deleted':
    case 'subscription.upgraded':
    case 'subscription.downgraded':
    case 'subscription.paused':
    case 'subscription.resumed':
      console.log(`${type}: ${data.email ?? data.id ?? '(unknown subscriber)'}`);
      break;
    case 'newsletter_list_subscription.subscribed':
      console.log(`List subscription: ${JSON.stringify(data)}`);
      break;
    case 'survey.response_submitted':
      console.log(`Survey response submitted: ${JSON.stringify(data)}`);
      break;
    case 'podcasts.episode.published':
      console.log(`Podcast episode published: ${JSON.stringify(data)}`);
      break;
    default:
      console.log(`Unhandled beehiiv event type: ${type}`);
  }
}

// express.raw({ type: '*/*' }) keeps the exact bytes for any content type.
// express.json() before verification would break the signature.
app.post('/webhooks/beehiiv', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BEEHIIV_WEBHOOK_SECRET) {
    console.error('BEEHIIV_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'svix-id': req.get('svix-id'),
    'svix-timestamp': req.get('svix-timestamp'),
    'svix-signature': req.get('svix-signature'),
  };
  if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
    return res.status(400).json({ error: 'Missing Svix signature headers' });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  let event;
  try {
    event = verifyBeehiivWebhook(req.body, headers);
  } catch (err) {
    console.error('beehiiv webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery); acknowledge with 200.
  const eventId = event.uid ?? headers['svix-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling beehiiv event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export { app };

// Start the server only when run directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`beehiiv webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/beehiiv`);
  });
}
