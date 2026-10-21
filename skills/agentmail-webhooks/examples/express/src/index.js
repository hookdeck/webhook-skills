// Generated with: agentmail-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// AgentMail delivers webhooks through Svix:
//   svix-id         message ID (differs per org/pod/inbox webhook)
//   svix-timestamp  Unix seconds when the message was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify an AgentMail delivery with the official Svix library.
 * Svix checks the timestamp (5-minute tolerance), recomputes the HMAC over
 * the raw body, and compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so parse the
 * JSON yourself afterwards. AgentMail's docs show `const msg = wh.verify(...)`,
 * which only works with svix 1.x.
 *
 * @param {Buffer|string} rawBody - the exact bytes AgentMail sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - the webhook's whsec_ signing secret
 * @returns {object} the parsed, verified payload
 * @throws {WebhookVerificationError} if the signature or timestamp is invalid
 */
export function verifyAgentMailWebhook(rawBody, headers, secret = process.env.AGENTMAIL_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody.toString('utf8'));
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on event_id, NOT svix-id: event_id is the same across retries and
// across every webhook (org, pod, inbox) that receives the event.
const processedEventIds = new Set();

function handleEvent(event) {
  const { event_type: eventType } = event;

  switch (eventType) {
    // --- Inbound mail ------------------------------------------------------
    case 'message.received': {
      // The only events that carry message content (plus thread metadata).
      // `text` may be missing for HTML-only emails; prefer `html`.
      const { message, thread } = event;
      console.log(
        `Email received in ${message.inbox_id} from ${message.from}: "${message.subject}" ` +
          `(thread ${thread.thread_id}, ${thread.message_count} messages)`
      );
      break;
    }
    case 'message.received.spam':
    case 'message.received.blocked':
    case 'message.received.unauthenticated':
      // Opt-in only; same shape as message.received.
      console.log(`${eventType}: ${event.message.message_id} from ${event.message.from}`);
      break;

    // --- Outbound mail -----------------------------------------------------
    case 'message.sent':
      console.log(`Message sent: ${event.send.message_id} to ${event.send.recipients.join(', ')}`);
      break;
    case 'message.delivered':
      console.log(`Message delivered: ${event.delivery.message_id}`);
      break;
    case 'message.bounced': {
      const { bounce } = event;
      const addresses = bounce.recipients.map((r) => r.address).join(', ');
      console.log(`Message bounced (${bounce.type}/${bounce.sub_type}): ${bounce.message_id} → ${addresses}`);
      break;
    }
    case 'message.complained':
      console.log(`Spam complaint on ${event.complaint.message_id}: ${event.complaint.recipients.join(', ')}`);
      break;
    case 'message.rejected':
      console.log(`Message rejected: ${event.reject.message_id} (${event.reject.reason})`);
      break;
    case 'message.opened':
      console.log(`Message opened: ${event.open.message_id} at ${event.open.timestamp}`);
      break;

    // --- Agent Armor ---------------------------------------------------------
    case 'message.security.completed':
      console.log(`Agent Armor verdict for ${event.message.message_id}: ${event.message.agent_armor.verdict}`);
      break;
    case 'message.security.review':
      console.log(`Agent Armor held ${event.message.message_id} for review`);
      break;
    case 'message.security.override':
      console.log(`Held message released: ${event.message.message_id} (${event.message.manual_override.reason})`);
      break;

    // --- Domains -------------------------------------------------------------
    case 'domain.verified':
      console.log(`Domain verified: ${event.domain.domain_id} (${event.domain.status})`);
      break;

    // --- Calendar --------------------------------------------------------------
    case 'calendar.event.created':
    case 'calendar.event.updated':
    case 'calendar.event.deleted':
    case 'calendar.event.responded':
    case 'calendar.event.starting':
    case 'calendar.event.ending':
      console.log(`${eventType}: ${event.calendar_event?.title ?? event.calendar_event?.event_id}`);
      break;

    default:
      console.log(`Unhandled AgentMail event type: ${eventType}`);
  }
}

// AgentMail webhook endpoint — express.raw() keeps the exact bytes for the HMAC.
// express.json() before verification would break the signature.
app.post('/webhooks/agentmail', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.AGENTMAIL_WEBHOOK_SECRET) {
    console.error('AGENTMAIL_WEBHOOK_SECRET is not set — rejecting delivery');
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
    return res.status(400).json({ error: 'Expected application/json body' });
  }

  let event;
  try {
    event = verifyAgentMailWebhook(req.body, headers);
  } catch (err) {
    console.error('AgentMail webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedEventIds.has(event.event_id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: AgentMail needs a 2xx within 15 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(event.event_id);
  } catch (err) {
    console.error('Error handling AgentMail event:', err);
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
    console.log(`AgentMail webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/agentmail`);
  });
}
