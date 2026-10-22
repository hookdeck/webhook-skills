// Generated with: cloudtalk-webhooks skill
// https://github.com/hookdeck/webhook-skills

import dotenv from 'dotenv';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// CloudTalk account-level webhooks (Settings > Webhooks) use the Svix scheme:
//   svix-id         delivery id (same on every retry of the event)
//   svix-timestamp  Unix seconds when the request was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
//
// NOT signed this way: the Call Flow Designer Webhook step, an AI Voice
// Agent's "Send via Webhook" option, and Workflow Automation actions.
// ---------------------------------------------------------------------------

/**
 * Verify a CloudTalk delivery with the Svix library. Svix checks the timestamp
 * (5-minute tolerance), recomputes the HMAC over the raw body, and compares in
 * constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so parse the
 * JSON yourself afterwards.
 *
 * @param {Buffer|string} rawBody - the exact bytes CloudTalk sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified event envelope
 * @throws {WebhookVerificationError} if the signature or timestamp is invalid
 */
export function verifyCloudTalkWebhook(rawBody, headers, secret = process.env.CLOUDTALK_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody.toString('utf8'));
}

// In-memory dedupe for the demo. Use a store with a unique constraint (Redis
// SET NX, unique index) in production and keep ids for 30 days, because
// Resend and Recover can replay anything within CloudTalk's retention window.
const processedEventIds = new Set();

// Envelope: { event_id, type, version, occurred_at, company_id, data }
function handleEvent(event) {
  const { type, data = {} } = event;

  switch (type) {
    // --- Calls ---------------------------------------------------------------
    case 'call.started':
      console.log(`Call started ${data.call_uuid} (${data.direction}) with ${data.external_number}`);
      break;
    case 'call.ringing':
      console.log(`Call ringing ${data.call_uuid}`);
      break;
    case 'call.answered':
      console.log(`Call answered ${data.call_uuid}`);
      break;
    case 'call.held':
    case 'call.resumed':
      // Events can arrive out of order: pair on call_uuid and sort by occurred_at.
      console.log(`${type} ${data.call_uuid} by ${data.user?.name}`);
      break;
    case 'call.ended':
      console.log(
        `Call ended ${data.call_uuid}: ${data.duration}s total, ${data.talking_time}s talking, recorded=${data.recorded}`
      );
      break;
    case 'call.recording_ready':
      // Async, can arrive minutes after call.ended.
      console.log(`Recording ready for call ${data.call_uuid}`);
      break;
    case 'call.tags_modified':
      console.log(`Tags modified on call ${data.call_uuid}`);
      break;

    // --- Contacts --------------------------------------------------------------
    case 'contact.created':
    case 'contact.updated':
      console.log(`${type}: ${data.name} (${data.id})`);
      break;
    case 'contact.deleted':
      // Id only.
      console.log(`Contact deleted: ${data.id}`);
      break;

    // --- Users -----------------------------------------------------------------
    case 'user.created':
    case 'user.updated':
      console.log(`${type}: ${data.name ?? data.id}`);
      break;
    case 'user.deleted':
      console.log(`User deleted: ${data.id}`);
      break;
    case 'user.status_changed':
      console.log(`User ${data.user_id} is now ${data.status} (${data.sub_status})`);
      break;

    // --- Messages (SMS, MMS, WhatsApp) -----------------------------------------
    case 'message.sent':
    case 'message.received':
      console.log(`${type} (${data.channel}) with ${data.external_number}: ${data.body}`);
      break;

    // --- Conversation Intelligence ---------------------------------------------
    case 'transcript.ready':
      console.log(`Transcript ready for call ${data.call_uuid ?? data.call_id}`);
      break;
    case 'cidata.ready':
      console.log(`AI analysis ready for call ${data.call_uuid ?? data.call_id}`);
      break;

    // --- AI Voice Agents and Dialer ----------------------------------------------
    case 'voice_agent.extracted_data_ready':
      console.log('Voice agent extracted data ready');
      break;
    case 'dialer.disposition_created':
      console.log('Dialer disposition recorded');
      break;
    case 'dialer.survey_filled':
      console.log('Dialer survey filled');
      break;

    default:
      // New event types are added over time: acknowledge and ignore.
      console.log(`Unhandled CloudTalk event type: ${type}`);
  }
}

// CloudTalk webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes
// for the HMAC whatever the content type. express.json() before verification
// would break the signature.
app.post('/webhooks/cloudtalk', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.CLOUDTALK_WEBHOOK_SECRET) {
    console.error('CLOUDTALK_WEBHOOK_SECRET is not set — rejecting delivery');
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
    event = verifyCloudTalkWebhook(req.body, headers);
  } catch (err) {
    console.error('CloudTalk webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Delivery is at-least-once: duplicates carry the same event_id.
  if (processedEventIds.has(event.event_id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // CloudTalk needs a 2xx within 15 seconds. In production, enqueue the
    // event here and process it asynchronously.
    processedEventIds.add(event.event_id); // claim before doing the work
    handleEvent(event);
  } catch (err) {
    processedEventIds.delete(event.event_id); // release so a retry can process it
    console.error('Error handling CloudTalk event:', err);
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
    console.log(`CloudTalk webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cloudtalk`);
  });
}
