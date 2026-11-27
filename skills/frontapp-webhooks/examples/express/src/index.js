// Generated with: frontapp-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const webhookSecret = process.env.FRONT_WEBHOOK_SECRET;

/**
 * Verify a Front application webhook signature.
 * Front signs `timestamp + ":" + rawBody` with HMAC-SHA256 (base64), keyed with the
 * app signing key, and delivers it in the X-Front-Signature header.
 */
function verifyFrontSignature(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp + ':');
  hmac.update(rawBody); // Buffer of the raw HTTP body
  const expected = hmac.digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

// Front webhook endpoint - must use raw body for signature verification
app.post(
  '/webhooks/frontapp',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

    // 1. Subscription validation: echo the X-Front-Challenge header within 10s.
    const challenge = req.headers['x-front-challenge'];
    if (challenge) {
      return res.status(200).json({ challenge });
    }

    // 2. Verify the signature on real events.
    const timestamp = req.headers['x-front-request-timestamp'];
    const signature = req.headers['x-front-signature'];

    if (!signature) {
      return res.status(400).send('Missing X-Front-Signature header');
    }

    if (!verifyFrontSignature(rawBody, timestamp, signature, webhookSecret)) {
      console.error('Front webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // 3. Parse and dispatch. `type` carries the event name.
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const eventType = event.type;

    switch (eventType) {
      case 'inbound_received':
        console.log('Inbound message received:', event.payload?.id);
        // Your code: triage, sync to CRM, alert, etc.
        break;

      case 'outbound_sent':
        console.log('Outbound message sent:', event.payload?.id);
        // Your code: log reply, track SLA, etc.
        break;

      case 'conversation_moved':
        console.log('Conversation moved:', event.payload?.conversation?.id);
        // Your code: routing analytics, notifications, etc.
        break;

      case 'assignee_changed':
        console.log('Assignee changed:', event.payload?.conversation?.id);
        // Your code: workload tracking, escalation, etc.
        break;

      case 'conversation_archived':
        console.log('Conversation archived:', event.payload?.conversation?.id);
        // Your code: close-out workflow, metrics, etc.
        break;

      case 'tag_added':
        console.log('Tag added:', event.payload?.conversation?.id);
        // Your code: categorization, automation, etc.
        break;

      case 'new_comment_added':
        console.log('Comment added:', event.payload?.conversation?.id);
        // Your code: internal collaboration hooks, etc.
        break;

      case 'message_delivery_failed':
        console.log('Message delivery failed:', event.payload?.id);
        // Your code: bounce handling, list hygiene, etc.
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Acknowledge quickly (Front expects 2xx within 5s).
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/frontapp`);
  });
}
