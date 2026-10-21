// Generated with: webex-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Webex webhook signature.
 *
 * When a webhook is created with a `secret`, Webex sends the hex HMAC-SHA1 of the
 * raw request body (keyed with the secret string as-is) in `X-Spark-Signature`.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} signature - X-Spark-Signature header value
 * @param {string} secret - The secret set when the webhook was created
 * @returns {boolean} - Whether the signature is valid
 */
function verifyWebexWebhook(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // Length mismatch = invalid
  }
}

// Webex webhook endpoint - must use raw body for signature verification
app.post(
  '/webhooks/webex',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const signature = req.headers['x-spark-signature'];
    const secret = process.env.WEBEX_WEBHOOK_SECRET;

    // Verify webhook signature
    if (!verifyWebexWebhook(req.body, signature, secret)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Webex identifies an event by resource + event, e.g. messages + created
    const event = `${payload.resource}.${payload.event}`;
    const data = payload.data || {};

    console.log(`Received ${event} event`);

    // Handle the event based on type
    switch (event) {
      case 'messages.created':
        // The webhook carries ids only; GET /v1/messages/{id} to fetch the text
        console.log(`Message ${data.id} in room ${data.roomId} from ${data.personEmail}`);
        // TODO: Fetch the message with your bot token and reply, route commands, etc.
        break;

      case 'messages.deleted':
        console.log(`Message deleted: ${data.id}`);
        // TODO: Remove the message from your own store, audit log, etc.
        break;

      case 'memberships.created':
        console.log(`Membership created: ${data.personEmail} in room ${data.roomId}`);
        // TODO: Send a welcome message, sync access, etc.
        break;

      case 'memberships.deleted':
        console.log(`Membership deleted: ${data.personEmail} from room ${data.roomId}`);
        // TODO: Offboarding, access sync, etc.
        break;

      case 'rooms.created':
        console.log(`Room created: ${data.id}`);
        // TODO: Provision resources for the new room, etc.
        break;

      case 'rooms.updated':
        console.log(`Room updated: ${data.id}`);
        // TODO: Sync room state (e.g. locked/unlocked), etc.
        break;

      case 'meetings.started':
        console.log(`Meeting started: ${data.id}`);
        // TODO: Notify attendees, start tracking, etc.
        break;

      case 'meetings.ended':
        console.log(`Meeting ended: ${data.id}`);
        // TODO: Trigger follow-ups, summaries, etc.
        break;

      case 'attachmentActions.created':
        console.log(`Card action ${data.id} on message ${data.messageId}`);
        // TODO: GET /v1/attachment/actions/{id} to read the submitted inputs
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 200 to acknowledge receipt (Webex disables webhooks that keep failing)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyWebexWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/webex`);
  });
}
