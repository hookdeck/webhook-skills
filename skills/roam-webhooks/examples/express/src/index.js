// Generated with: roam-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();

// Event IDs already handled (in-memory for the example; use a database or Redis in production)
const seen = new Set();

/**
 * One Roam event can arrive as two POSTs with the same webhook-id: a legacy
 * tagged-id body (type: "message") and the v1 envelope (type: "chat.message").
 * Only the v1 envelope has a dotted type and a data object.
 */
function isV1Envelope(event) {
  return typeof event?.type === 'string' && event.type.includes('.') && typeof event.data === 'object';
}

/** Handle a verified Roam v1 envelope: { type, eventId, timestamp, apiVersion, data } */
function handleEvent(event) {
  const { type, data } = event;
  switch (type) {
    case 'chat.message':
      if (data.contentType === 'deleted') console.log(`Chat message deleted in chat ${data.chatId}`);
      else console.log(`Chat message in chat ${data.chatId} (version ${data.version})`);
      break;
    case 'chat.reaction':
      console.log(`Chat reaction event for chat ${data.chatId}`);
      break;
    case 'meeting.started':
      console.log(`Meeting started: ${data.id}`);
      break;
    case 'meeting.ended':
      console.log(`Meeting ended: ${data.title} (${data.id})`);
      break;
    case 'lobby.booked':
      console.log('Lobby booked');
      break;
    case 'magicast.created':
      console.log('Magicast created');
      break;
    case 'onair.event.created':
      console.log('On-Air event created');
      break;
    default:
      console.log(`Unhandled Roam event: ${type}`);
  }

  // TODO: acknowledge first, then do the real work in a background job
}

// Roam webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/roam',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.ROAM_WEBHOOK_SIGNING_SECRET;
    if (!secret) {
      console.error('ROAM_WEBHOOK_SIGNING_SECRET is not set');
      return res.status(500).send('Server configuration error');
    }

    const webhookId = req.headers['webhook-id'];
    const webhookTimestamp = req.headers['webhook-timestamp'];
    const webhookSignature = req.headers['webhook-signature'];

    // Unsigned deliveries (no signing secret configured in Roam) lack these headers
    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return res.status(400).send('Missing webhook-id, webhook-timestamp or webhook-signature header');
    }

    let event;
    try {
      // Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}",
      // rejects timestamps more than 5 minutes off, and returns the parsed payload.
      // Behind Hookdeck retries/replays, use the manual verifier in references/verification.md.
      event = new Webhook(secret).verify(req.body.toString('utf8'), {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      });
    } catch (err) {
      console.error('Roam webhook verification failed:', err.message);
      return res.status(400).send('Invalid signature');
    }

    // Legacy body of the same event: acknowledge and skip, the v1 body carries the same webhook-id
    if (!isV1Envelope(event)) {
      return res.status(200).json({ received: true, ignored: 'legacy body' });
    }

    // Dedupe on webhook-id (retries reuse it)
    if (seen.has(webhookId)) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    try {
      handleEvent(event);
      seen.add(webhookId);
    } catch (err) {
      console.error('Error handling Roam webhook:', err);
      return res.status(500).send('Internal error');
    }

    // Respond within 3 seconds; 2xx = delivered
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, seen };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/roam`);
  });
}
