// Generated with: ada-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Ada (ada.cx) delivers webhooks through Svix:
//   svix-id         unique message ID (stable across retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Each Ada webhook endpoint has its own signing secret.
// ---------------------------------------------------------------------------

/**
 * Verify an Ada delivery with the Standard Webhooks library (maintained by
 * Svix; same algorithm as the `svix` SDK). It checks the timestamp (5-minute
 * tolerance), recomputes the HMAC over the raw body, and compares in constant
 * time against every `v1,` entry. It expects webhook-* header names, so the
 * svix-* headers Ada sends are mapped across.
 *
 * @param {string} rawBody - the exact body Ada sent
 * @param {object} headers - must contain svix-id/-timestamp/-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event
 * @throws {Error} if verification fails
 */
function verifyAdaWebhook(rawBody, headers, secret = process.env.ADA_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['svix-id'],
    'webhook-timestamp': headers['svix-timestamp'],
    'webhook-signature': headers['svix-signature'],
  }); // throws WebhookVerificationError; returns the parsed JSON body
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Ada payloads carry no top-level event ID, so dedupe on the svix-id header.
const processedMessageIds = new Set();

function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    // --- Conversations -----------------------------------------------------
    case 'v1.conversation.created':
      console.log(`Conversation created: ${data.conversation_id} (end user ${data.end_user_id})`);
      break;
    case 'v1.conversation.message':
      // author.role is end_user, ai_agent or human_agent; content.type is
      // text, link, file or quick_replies.
      console.log(
        `Message ${data.message_id} in ${data.conversation_id} from ${data.author?.role}: ${data.content?.type}`
      );
      break;
    case 'v1.conversation.ended':
      console.log(`Conversation ended: ${data.conversation_id} (by ${data.ended_by?.role})`);
      break;
    case 'v1.conversation.handoff.ended':
      console.log(`Handoff to ${data.handoff_integration} ended in ${data.conversation_id}`);
      break;

    // --- End users ---------------------------------------------------------
    case 'v1.end_user.created':
    case 'v1.end_user.updated':
      console.log(`${type}: ${data.end_user_id}`);
      break;

    // --- Audit log (best effort; reconcile with the Audit log pull API) ----
    case 'v1.audit_log.emitted':
      console.log(`Audit log: ${data.entity_type} ${data.entity_id} ${data.activity}`);
      break;

    // --- Voice Proactive Outreach (can arrive out of order) ----------------
    case 'v1.proactive_call.queued':
    case 'v1.proactive_call.initiated':
    case 'v1.proactive_call.answered':
    case 'v1.proactive_call.machine_detected':
      console.log(`Proactive call ${data.proactive_attempt_id} -> ${data.state}`);
      break;
    case 'v1.proactive_call.failed':
      console.log(`Proactive call ${data.proactive_attempt_id} failed: ${data.failure_reason}`);
      break;

    default:
      console.log(`Unhandled Ada event type: ${type}`);
  }
}

// Ada webhook endpoint. express.raw() keeps the exact bytes for the HMAC;
// express.json() would re-serialise the body and break verification.
app.post('/webhooks/ada', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.ADA_WEBHOOK_SECRET) {
    console.error('ADA_WEBHOOK_SECRET is not set; rejecting delivery');
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

  let event;
  try {
    event = verifyAdaWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Ada webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Retries reuse the same svix-id; acknowledge duplicates with 200.
  const messageId = headers['svix-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Ada needs a 2xx within 15 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Ada event:', err);
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
    console.log(`Ada webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ada`);
  });
}

module.exports = { app, server, verifyAdaWebhook };
