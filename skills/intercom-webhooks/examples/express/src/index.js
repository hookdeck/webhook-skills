// Generated with: intercom-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Intercom webhook signature.
 *
 * Intercom signs the raw JSON body with HMAC-SHA1 using your app's
 * client_secret. The signature is sent in the X-Hub-Signature header as
 * "sha1=<hex_digest>".
 *
 * @param {Buffer} rawBody          Raw request body (Buffer)
 * @param {string} signatureHeader  X-Hub-Signature header value
 * @param {string} clientSecret    Your Intercom app's client_secret
 * @returns {boolean}              Whether the signature is valid
 */
function verifyIntercomWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader || !clientSecret) {
    return false;
  }

  const [algorithm, signature] = signatureHeader.split('=');
  if (algorithm !== 'sha1' || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha1', clientSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// Intercom webhook endpoint — must use raw body for HMAC verification
app.post('/webhooks/intercom',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-hub-signature'];

    if (!verifyIntercomWebhook(req.body, signature, process.env.INTERCOM_CLIENT_SECRET)) {
      console.error('Intercom signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const notification = JSON.parse(req.body.toString());
    const topic = notification.topic;
    const item = notification.data?.item;

    console.log(`Received ${topic} (notification id: ${notification.id})`);

    switch (topic) {
      case 'ping':
        // Handshake sent when the webhook is saved in the Developer Hub
        console.log('Ping received');
        break;

      case 'conversation.user.created':
        console.log('New conversation from user:', item?.id);
        // TODO: Auto-acknowledge, route to a team, etc.
        break;

      case 'conversation.user.replied':
        console.log('User replied to conversation:', item?.id);
        // TODO: Re-open ticket, alert on-call, etc.
        break;

      case 'conversation.admin.replied':
        console.log('Admin replied to conversation:', item?.id);
        // TODO: Sync reply to CRM, etc.
        break;

      case 'conversation.admin.assigned':
        console.log('Conversation assigned:', item?.id);
        // TODO: Update routing metrics, SLA timers, etc.
        break;

      case 'conversation.admin.closed':
        console.log('Conversation closed:', item?.id);
        // TODO: Trigger CSAT survey
        break;

      case 'contact.user.created':
        console.log('New user contact:', item?.id);
        // TODO: Sync to CRM / data warehouse
        break;

      case 'contact.lead.created':
        console.log('New lead contact:', item?.id);
        // TODO: Marketing automation
        break;

      case 'contact.user.tag.created':
        console.log('Tag applied to user:', item?.id);
        // TODO: Segment-based workflow
        break;

      case 'ticket.created':
        console.log('New ticket:', item?.id);
        // TODO: Mirror into ticketing system
        break;

      case 'ticket.admin.assigned':
        console.log('Ticket assigned:', item?.id);
        break;

      case 'ticket.state.updated':
        console.log('Ticket state updated:', item?.id);
        break;

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    // Acknowledge quickly — Intercom expects 2xx within ~5 seconds
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyIntercomWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/intercom`);
  });
}
