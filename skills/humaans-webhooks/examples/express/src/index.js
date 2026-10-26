// Generated with: humaans-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();

/**
 * Handle a verified Humaans event. The body is a wrapper
 * { id, seq, ts, action, subject, actor, entity }; dispatch on `action`.
 */
function handleEvent(event) {
  switch (event.action) {
    case 'person.created':
      console.log(`Person created: ${event.subject?.id}`);
      break;
    case 'person.updated':
      console.log(`Person updated: ${event.subject?.id} (changed: ${(event.entity?.fieldsChanged ?? []).join(', ')})`);
      break;
    case 'person.offboarded':
      console.log(`Person offboarded: ${event.subject?.id}`);
      break;
    case 'timeAway.created':
      console.log(`Time away requested: ${event.entity?.id}`);
      break;
    case 'timeAway.approved':
      console.log(`Time away approved: ${event.entity?.id}`);
      break;
    case 'compensation.updated':
      console.log(`Compensation updated: ${event.entity?.id} (${event.entity?.metadata?.type ?? 'unknown type'})`);
      break;
    default:
      console.log(`Unhandled Humaans event: ${event.action}`);
  }

  // TODO: sync the change to payroll, your directory, etc.
  // Deduplicate on the webhook-id header: retries reuse it.
}

// Humaans delivers via Svix, which may send webhook-* or svix-* headers
function header(req, name) {
  return req.headers[`webhook-${name}`] ?? req.headers[`svix-${name}`];
}

// Humaans webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/humaans',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.HUMAANS_WEBHOOK_SECRET;
    if (!secret) {
      console.error('HUMAANS_WEBHOOK_SECRET is not set');
      return res.status(500).send('Server configuration error');
    }

    const webhookId = header(req, 'id');
    const webhookTimestamp = header(req, 'timestamp');
    const webhookSignature = header(req, 'signature');

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return res.status(400).send('Missing webhook-id, webhook-timestamp or webhook-signature header');
    }

    let event;
    try {
      // Verifies HMAC-SHA256 over "{id}.{timestamp}.{raw body}", rejects timestamps
      // more than 5 minutes off, and returns the parsed payload. Behind Hookdeck,
      // retries and replays keep the original timestamp: for those, use the manual
      // verifier in references/verification.md and choose your own window.
      event = new Webhook(secret).verify(req.body.toString('utf8'), {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      });
    } catch (err) {
      console.error('Humaans webhook verification failed:', err.message);
      return res.status(400).send('Invalid signature');
    }

    try {
      handleEvent(event);
    } catch (err) {
      console.error('Error handling Humaans webhook:', err);
      return res.status(500).send('Internal error');
    }

    // Any 2xx = delivered; other responses are retried with exponential backoff
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/humaans`);
  });
}
