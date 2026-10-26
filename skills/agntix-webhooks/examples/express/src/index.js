// Generated with: agntix-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Agntix delivers webhooks through Svix:
//   svix-id         message ID
//   svix-timestamp  Unix seconds when the message was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify an Agntix delivery with the official Svix library.
 * Svix checks the timestamp (fixed 5-minute tolerance), recomputes the HMAC
 * over the raw body, and compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so parse the
 * JSON yourself afterwards.
 *
 * Hookdeck retries and replays resend the ORIGINAL timestamp, so this library
 * check rejects deliveries retried after 5 minutes. To drop or widen the
 * window, use the manual verifier in references/verification.md.
 *
 * @param {Buffer|string} rawBody - the exact bytes Agntix sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified payload
 * @throws {WebhookVerificationError} if the signature or timestamp is invalid
 */
export function verifyAgntixWebhook(rawBody, headers, secret = process.env.AGNTIX_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody.toString('utf8'));
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The top-level `id` is the SESSION UUID and is shared by session.created and
// session.ended, so the key combines eventType and id.
const processedEvents = new Set();

function handleEvent(event) {
  // Flat envelope (no `data`). `eventType` is the event; `type` is VOICE | CHAT.
  switch (event.eventType) {
    case 'session.created': {
      // Fires when the session is initiated (for outbound calls: before pickup).
      const vars = event.metadata?.sessionVariables ?? {};
      console.log(
        `Session created: ${event.id} (${event.type}/${event.platform}/${event.direction}) ` +
          `agent ${event.agentId}, variables ${JSON.stringify(vars)}`
      );
      break;
    }
    case 'session.ended': {
      // Fires once when the session closes, with the post-call analysis attached.
      const { analysis, recordingUrl } = event;
      console.log(
        `Session ended: ${event.id} at ${event.endedAt}. ` +
          `Summary: ${analysis?.summary ?? 'n/a'}. Recording: ${recordingUrl ?? 'n/a'}`
      );
      break;
    }
    default:
      console.log(`Unhandled Agntix event type: ${event.eventType}`);
  }
}

// Agntix webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes
// for the HMAC whatever the content type. Parse JSON only after verification.
app.post('/webhooks/agntix', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.AGNTIX_WEBHOOK_SECRET) {
    console.error('AGNTIX_WEBHOOK_SECRET is not set — rejecting delivery');
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
    event = verifyAgntixWebhook(req.body, headers);
  } catch (err) {
    console.error('Agntix webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  const dedupeKey = `${event.eventType}:${event.id}`;
  if (processedEvents.has(dedupeKey)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Agntix needs a 2xx within 15 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEvents.add(dedupeKey);
  } catch (err) {
    console.error('Error handling Agntix event:', err);
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
    console.log(`Agntix webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/agntix`);
  });
}
