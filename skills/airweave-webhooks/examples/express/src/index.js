// Generated with: airweave-webhooks skill
// https://github.com/hookdeck/webhook-skills

import dotenv from 'dotenv';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Airweave delivers webhooks through Svix (Standard Webhooks):
//   svix-id         message ID, stable across retries to one subscription
//   svix-timestamp  Unix seconds when the delivery attempt was made
//   svix-signature  space-delimited "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify an Airweave delivery with the official Svix library. Svix checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so parse the
 * JSON yourself afterwards.
 *
 * @param {Buffer|string} rawBody - the exact bytes Airweave sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - the subscription's whsec_ signing secret
 * @returns {object} the parsed, verified payload
 * @throws {WebhookVerificationError} if the signature or timestamp is invalid
 */
export function verifyAirweaveWebhook(rawBody, headers, secret = process.env.AIRWEAVE_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody.toString('utf8'));
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// svix-id is the same on every retry of a message to this subscription.
const processedMessageIds = new Set();

function handleEvent(event) {
  const { event_type: eventType } = event;

  switch (eventType) {
    // --- Sync jobs ---------------------------------------------------------
    case 'sync.pending':
    case 'sync.running':
    case 'sync.cancelled':
      console.log(`${eventType}: job ${event.sync_job_id} for ${event.collection_name} (${event.source_type})`);
      break;
    case 'sync.completed':
      // Metrics are only present on sync.completed.
      console.log(
        `Sync completed: ${event.collection_name} (${event.entities_inserted ?? 0} inserted, ` +
          `${event.entities_updated ?? 0} updated, ${event.entities_deleted ?? 0} deleted, ` +
          `${event.chunks_written ?? 0} chunks)`
      );
      // Trigger your downstream workflow here.
      break;
    case 'sync.failed':
      console.log(`Sync failed: ${event.collection_name} (${event.source_type}) - ${event.error ?? 'Unknown error'}`);
      // Send an alert here.
      break;

    // --- Source connections --------------------------------------------------
    case 'source_connection.created':
      console.log(`Source connection created: ${event.source_type} (authenticated: ${event.is_authenticated})`);
      break;
    case 'source_connection.auth_completed':
      console.log(`Source connection authenticated: ${event.source_type} ${event.source_connection_id}`);
      break;
    case 'source_connection.deleted':
      console.log(`Source connection deleted: ${event.source_type} ${event.source_connection_id}`);
      break;

    // --- Collections -----------------------------------------------------------
    case 'collection.created':
    case 'collection.updated':
    case 'collection.deleted':
      console.log(`${eventType}: ${event.collection_name} (${event.collection_readable_id})`);
      break;

    default:
      // The docs say to ignore unknown types so new events don't break you.
      console.log(`Unhandled Airweave event type: ${eventType}`);
  }
}

// Airweave webhook endpoint. express.raw() keeps the exact bytes for the HMAC
// whatever the content type; express.json() before verification would break it.
app.post('/webhooks/airweave', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.AIRWEAVE_WEBHOOK_SECRET) {
    console.error('AIRWEAVE_WEBHOOK_SECRET is not set, rejecting delivery');
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
    return res.status(400).json({ error: 'Expected a request body' });
  }

  let event;
  try {
    event = verifyAirweaveWebhook(req.body, headers);
  } catch (err) {
    console.error('Airweave webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery): acknowledge with 200.
  if (processedMessageIds.has(headers['svix-id'])) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Airweave times out after 30 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(headers['svix-id']);
  } catch (err) {
    console.error('Error handling Airweave event:', err);
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
    console.log(`Airweave webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/airweave`);
  });
}
