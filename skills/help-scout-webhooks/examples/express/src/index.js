require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Help Scout webhook signature.
 * Help Scout sends the base64 HMAC-SHA1 of the raw body in X-HelpScout-Signature.
 * @param {Buffer|string} rawBody - Raw request body, exactly as received
 * @param {string} signatureHeader - X-HelpScout-Signature header value
 * @param {string} secret - Webhook secret key from Workspace > Apps > Webhooks
 * @returns {boolean} - Whether the signature is valid
 */
function verifyHelpScoutWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    // Different lengths mean the signature is invalid
    return false;
  }
}

// Help Scout webhook endpoint - must use the raw body for signature verification.
// type '*/*' makes the raw parser accept any content type.
app.post('/webhooks/help-scout',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-helpscout-signature'];
    const event = req.headers['x-helpscout-event'];

    if (!signature) {
      return res.status(400).send('Missing signature header');
    }

    if (!Buffer.isBuffer(req.body) ||
        !verifyHelpScoutWebhook(req.body, signature, process.env.HELPSCOUT_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      // Never return 410 here: Help Scout deletes the webhook on 410
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    console.log(`Received ${event} webhook`);

    // The event name is in the X-HelpScout-Event header, not the body
    switch (event) {
      case 'convo.created':
        console.log('Conversation created:', payload.id, payload.subject);
        // TODO: Create a ticket in another system, alert a channel, etc.
        break;

      case 'convo.assigned':
        console.log('Conversation assigned:', payload.id);
        // TODO: Notify the assignee, update routing, etc.
        break;

      case 'convo.status':
        console.log('Conversation status updated:', payload.id, payload.status);
        // TODO: Sync status, trigger follow-up on close, etc.
        break;

      case 'convo.customer.reply.created':
        console.log('Customer replied on conversation:', payload.id);
        // TODO: Escalate, reopen external tasks, etc.
        break;

      case 'convo.agent.reply.created':
        console.log('Agent replied on conversation:', payload.id);
        // TODO: Record response-time metrics, etc.
        break;

      case 'customer.created':
        console.log('Customer created:', payload.id);
        // TODO: Sync to CRM, etc.
        break;

      case 'customer.updated':
        console.log('Customer updated:', payload.id);
        // TODO: Keep profiles in sync, etc.
        break;

      case 'satisfaction.ratings':
        console.log('Satisfaction rating received:', payload.id);
        // TODO: Report CSAT, alert on low scores, etc.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Any 2xx acknowledges receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyHelpScoutWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/help-scout`);
  });
}
