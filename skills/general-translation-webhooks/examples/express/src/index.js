// Generated with: general-translation-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// General Translation signs webhooks with Standard Webhooks:
//   webhook-id         event ID (evt_...), stable across retries
//   webhook-timestamp  Unix seconds when the attempt was sent
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Read the signature headers. General Translation sends webhook-*; when
 * webhook-id is absent, fall back to the svix-* names (as Hookdeck does).
 * Returns the three values under the names the library expects.
 *
 * @param {(name: string) => string | undefined} get - header lookup
 * @returns {object|null} null when a header is missing
 */
function resolveSignatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  const headers = {
    'webhook-id': get(`${prefix}-id`),
    'webhook-timestamp': get(`${prefix}-timestamp`),
    'webhook-signature': get(`${prefix}-signature`),
  };
  return Object.values(headers).every(Boolean) ? headers : null;
}

/**
 * Verify a delivery with the Standard Webhooks library. It enforces a fixed
 * 5-minute timestamp window, recomputes the HMAC over the raw body and
 * compares in constant time against every `v1,` entry (other versions are
 * ignored). Hookdeck retries and replays resend the ORIGINAL timestamp, so
 * late retries fail here; see references/verification.md for a manual
 * verifier with a configurable window.
 *
 * @param {string} rawBody - the exact body General Translation sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyGeneralTranslationWebhook(
  rawBody,
  headers,
  secret = process.env.GENERAL_TRANSLATION_WEBHOOK_SECRET
) {
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// event.id (evt_...) equals the webhook-id header and is stable across retries.
const processedEventIds = new Set();

function handleEvent(event) {
  // data.object.object is the resource kind (translated_file or
  // translation_job), not the event type.
  const resource = (event.data && event.data.object) || {};

  switch (event.type) {
    case 'translated_file.completed':
      console.log(`Translated file ${resource.id} ready (${resource.locale}, ${resource.fileFormat})`);
      break;
    case 'translated_file.edited':
      console.log(`Translated file ${resource.id} edited at ${resource.editedAt}`);
      break;
    case 'translation_job.completed':
      console.log(`Translation job ${resource.jobId} completed at ${resource.completedAt}`);
      break;
    default:
      console.log(`Unhandled General Translation event type: ${event.type}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC for any content type;
// express.json() would re-serialise the body and break verification.
app.post('/webhooks/general-translation', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.GENERAL_TRANSLATION_WEBHOOK_SECRET) {
    console.error('GENERAL_TRANSLATION_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = resolveSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  let event;
  try {
    event = verifyGeneralTranslationWebhook(Buffer.from(req.body).toString('utf8'), headers);
  } catch (err) {
    console.error('General Translation webhook verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Deliveries are at-least-once; acknowledge duplicates with 200.
  if (processedEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Respond with a 2xx within 10 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling General Translation event:', err);
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
    console.log(`General Translation webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/general-translation`);
  });
}

module.exports = { app, server, verifyGeneralTranslationWebhook, resolveSignatureHeaders };
