// Generated with: velt-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Velt Advanced (V2) webhooks (Enterprise, delivered through Svix) are signed with
// Standard Webhooks:
//   webhook-id         message id, the same on every retry of a delivery
//   webhook-timestamp  Unix seconds when this attempt was signed
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Each webhook endpoint has its own signing secret. Basic (V1) webhooks are not
// signed (they send `Authorization: Basic <token>`), so they fail this check.
// Hookdeck's Velt source also accepts the svix-* header names when
// webhook-id is absent, so this handler does the same.
// ---------------------------------------------------------------------------

/**
 * Read the three signature headers: webhook-* first, svix-* when webhook-id is
 * absent. Returns them under the webhook-* names the library expects, or null
 * if any is missing.
 */
function resolveSignatureHeaders(get) {
  const prefix = get('webhook-id') ? 'webhook' : 'svix';
  const id = get(`${prefix}-id`);
  const timestamp = get(`${prefix}-timestamp`);
  const signature = get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify a Velt delivery with the Standard Webhooks library. It checks the
 * timestamp (fixed 5-minute tolerance), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * @param {string|Buffer} rawBody - the exact body Velt sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyVeltWebhook(rawBody, headers, secret = process.env.VELT_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers); // returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The webhook-id header is the message id: the same on every retry of a delivery.
const processedMessageIds = new Set();

function handleEvent(payload) {
  // Body: { actionType, data, event, platform, source, webhookId }. `event` is the
  // event type; `data` holds actionUser, the feature object and metadata.
  const { event, data = {} } = payload;
  const doc = data.metadata?.document?.documentId ?? 'unknown document';
  const annotation = data.commentAnnotation?.annotationId ?? 'unknown annotation';

  switch (event) {
    // --- Comment threads (annotations) ---------------------------------------
    case 'comment_annotation.add':
    case 'comment_annotation.assign':
    case 'comment_annotation.status_change':
    case 'comment_annotation.priority_change':
    case 'comment_annotation.custom_list_change':
    case 'comment_annotation.subscribe':
    case 'comment_annotation.unsubscribe':
    // Moderator Mode only
    case 'comment_annotation.accept':
    case 'comment_annotation.reject':
    case 'comment_annotation.approve':
    // Opt-in: enable these explicitly to receive them
    case 'comment_annotation.suggestion_accept':
    case 'comment_annotation.suggestion_reject':
      console.log(`${event}: ${annotation} in ${doc}`);
      break;

    // --- Comments (messages) -------------------------------------------------
    case 'comment.add':
    case 'comment.update':
    case 'comment.delete':
    case 'comment.reaction_add':
    case 'comment.reaction_delete':
      console.log(`${event}: ${annotation} in ${doc}`);
      break;

    // --- Huddles -------------------------------------------------------------
    case 'huddle.create':
    case 'huddle.join':
      console.log(`${event}: ${doc}`);
      break;

    // --- CRDT ----------------------------------------------------------------
    case 'crdt.update_data':
      // Debounced by 5 seconds: one event can cover several edits.
      console.log(`CRDT data updated: ${data.crdtData?.id ?? 'unknown'} in ${doc}`);
      break;

    // --- Recorder ------------------------------------------------------------
    case 'recorder.done':
      console.log(`Recording finished in ${doc}`);
      break;

    // --- Review Workflow Builder ---------------------------------------------
    case 'execution.dispatched':
    case 'execution.completed':
    case 'execution.failed':
    case 'execution.cancelled':
    case 'step.awaiting-approval':
    case 'step.completed':
    case 'step.failed':
    case 'step.breached':
    case 'step.cancelled':
    case 'group.quorum-met':
    case 'loop.iteration-started':
    case 'loop.exhausted':
      console.log(`Review workflow event: ${event}`);
      break;

    default:
      // Encoded (Base64) or encrypted payloads have no top-level `event`; decode or
      // decrypt them first. Unknown types: the documented list may grow, so acknowledge.
      console.log(`Unhandled Velt event type: ${event}`);
  }
}

// Velt webhook endpoint. express.raw() keeps the exact bytes for the HMAC for
// any content type; express.json() would re-serialise the body and break
// verification. The body is parsed only after the signature check passes.
app.post('/webhooks/velt', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.VELT_WEBHOOK_SECRET) {
    console.error('VELT_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = resolveSignatureHeaders((name) => req.get(name));
  if (!headers) {
    return res.status(400).json({ error: 'Missing signature headers' });
  }

  let event;
  try {
    event = verifyVeltWebhook(req.body, headers);
  } catch (err) {
    console.error('Velt webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Delivery is at-least-once; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Velt expects a 2xx within 15 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Velt event:', err);
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
    console.log(`Velt webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/velt`);
  });
}

module.exports = { app, server, verifyVeltWebhook, resolveSignatureHeaders };
