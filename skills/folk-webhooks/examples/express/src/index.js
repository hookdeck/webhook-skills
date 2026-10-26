// Generated with: folk-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// folk (CRM) webhooks follow the Standard Webhooks spec:
//   webhook-id         unique event ID (same as the payload's `id`)
//   webhook-timestamp  Unix seconds of the delivery
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the signing secret after its `whsec_` prefix.
// The secret is shown only once, when the webhook is created.
// ---------------------------------------------------------------------------

/**
 * Verify a folk delivery with the official Standard Webhooks library. It checks
 * the timestamp (fixed 5-minute window), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * Replays and Hookdeck retries resend the ORIGINAL timestamp, so this rejects
 * them after 5 minutes. See references/verification.md for a manual verifier
 * where the window can be dropped or widened.
 *
 * @param {string} rawBody - the exact body folk sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @param {string} secret - the webhook's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyFolkWebhook(rawBody, headers, secret = process.env.FOLK_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// folk can deliver an event more than once; webhook-id (= event.id) is stable.
const processedEventIds = new Set();

// Payloads are thin: data.id and data.url identify the resource (GET data.url
// for the full record). Updates carry data.changes, deletions carry data.details.
function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    // --- People ------------------------------------------------------------
    case 'person.created':
      console.log(`Person created: ${data.id}`);
      break;
    case 'person.updated':
      console.log(`Person updated: ${data.id} (${(data.changes || []).length} changes)`);
      break;
    case 'person.deleted':
      console.log(`Person deleted: ${data.id} (${data.details?.name})`);
      break;
    case 'person.groups_updated':
      console.log(`Person groups updated: ${data.id}`);
      break;
    case 'person.workspace_interaction_metadata_updated':
      console.log(`Person interaction metadata updated: ${data.id}`);
      break;

    // --- Companies ---------------------------------------------------------
    case 'company.created':
      console.log(`Company created: ${data.id}`);
      break;
    case 'company.updated':
      console.log(`Company updated: ${data.id} (${(data.changes || []).length} changes)`);
      break;
    case 'company.deleted':
      console.log(`Company deleted: ${data.id} (${data.details?.name})`);
      break;
    case 'company.groups_updated':
      console.log(`Company groups updated: ${data.id}`);
      break;

    // --- Custom objects (e.g. deals) ---------------------------------------
    case 'object.created':
      console.log(`Object created: ${data.id}`);
      break;
    case 'object.updated':
      console.log(`Object updated: ${data.id} (${(data.changes || []).length} changes)`);
      break;
    case 'object.deleted':
      console.log(`Object deleted: ${data.id} (${data.details?.name})`);
      break;

    // --- Notes -------------------------------------------------------------
    case 'note.created':
    case 'note.updated':
    case 'note.deleted':
      console.log(`${type}: ${data.id}`);
      break;

    // --- Reminders ---------------------------------------------------------
    case 'reminder.created':
    case 'reminder.updated':
    case 'reminder.deleted':
    case 'reminder.triggered':
      console.log(`${type}: ${data.id}`);
      break;

    // --- Person enrichments ------------------------------------------------
    case 'person_enrichment.finished':
      console.log(`Enrichment ${data.id} finished`);
      break;

    default:
      console.log(`Unhandled folk event type: ${type}`);
  }
}

// folk webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes for
// the HMAC whatever the content type; express.json() would re-serialise the
// body and break verification.
app.post('/webhooks/folk', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.FOLK_WEBHOOK_SECRET) {
    console.error('FOLK_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyFolkWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('folk webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Redeliveries reuse the same webhook-id; acknowledge duplicates with 200.
  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Return a 2xx quickly. In production, enqueue the event here and process
    // it asynchronously (a 410 would deactivate the webhook, so never send one).
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling folk event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`folk webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/folk`);
  });
}

module.exports = { app, server, verifyFolkWebhook };
