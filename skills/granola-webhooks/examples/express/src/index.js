// Generated with: granola-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();

/**
 * Handle a verified Granola event. Payloads carry no note content, only
 * { event_id, event_type, note_id, occurred_at } (plus data.changed_fields
 * on note.edited). Fetch the note with Get Note and your Granola API key.
 */
function handleEvent(event) {
  switch (event.event_type) {
    case 'note.generated':
      console.log(`Note generated: ${event.note_id}`);
      break;
    case 'note.edited':
      console.log(`Note edited: ${event.note_id} (changed: ${(event.data?.changed_fields ?? []).join(', ')})`);
      break;
    case 'note.access_granted':
      console.log(`Note shared with you: ${event.note_id}`);
      break;
    default:
      console.log(`Unhandled Granola event: ${event.event_type}`);
  }

  // TODO: GET https://public-api.granola.ai/v1/notes/{note_id} with your API key,
  // then sync the summary to your CRM, wiki, etc.
  // Deduplicate on event_id: retries reuse it.
}

// Granola webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/granola',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.GRANOLA_WEBHOOK_SECRET;
    if (!secret) {
      console.error('GRANOLA_WEBHOOK_SECRET is not set');
      return res.status(500).send('Server configuration error');
    }

    const webhookId = req.headers['webhook-id'];
    const webhookTimestamp = req.headers['webhook-timestamp'];
    const webhookSignature = req.headers['webhook-signature'];

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return res.status(400).send('Missing webhook-id, webhook-timestamp or webhook-signature header');
    }

    let event;
    try {
      // Verifies HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}",
      // rejects timestamps more than 5 minutes off, and returns the parsed payload.
      event = new Webhook(secret).verify(req.body.toString('utf8'), {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      });
    } catch (err) {
      console.error('Granola webhook verification failed:', err.message);
      return res.status(400).send('Invalid signature');
    }

    try {
      handleEvent(event);
    } catch (err) {
      console.error('Error handling Granola webhook:', err);
      return res.status(500).send('Internal error');
    }

    // Respond within 15 seconds; 2xx = delivered
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/granola`);
  });
}
