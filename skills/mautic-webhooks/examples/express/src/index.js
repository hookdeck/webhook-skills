require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the Mautic Webhook-Signature header.
 * Mautic sends base64(HMAC-SHA256(rawBody, secret)). Nothing else is signed.
 */
function verifyMauticWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths = invalid
  }
}

// Mautic webhook endpoint. express.raw with '*/*' keeps the raw bytes for
// signature verification whatever Content-Type Mautic sends.
app.post('/webhooks/mautic',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['webhook-signature'];

    if (!signature) {
      return res.status(400).send('Missing Webhook-Signature header');
    }

    if (!Buffer.isBuffer(req.body) || !verifyMauticWebhook(req.body, signature, process.env.MAUTIC_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The body is keyed by event type; each value is an array of events.
    // In queue mode one request can hold several types and several events per type.
    for (const [eventType, events] of Object.entries(payload)) {
      for (const event of Array.isArray(events) ? events : []) {
        handleEvent(eventType, event);
      }
    }

    res.status(200).send('OK');
  }
);

function handleEvent(eventType, event) {
  switch (eventType) {
    case 'mautic.lead_post_save_new':
      console.log('Contact identified:', event.contact?.id);
      // TODO: Sync new contact to CRM, etc.
      break;

    case 'mautic.lead_post_save_update':
      console.log('Contact updated:', event.contact?.id);
      // TODO: Update external record
      break;

    case 'mautic.lead_post_delete':
      console.log('Contact deleted:', event.id);
      // TODO: Remove external copies
      break;

    case 'mautic.lead_points_change':
      console.log('Points changed:', event.contact?.id, event.points?.old_points, '->', event.points?.new_points);
      break;

    case 'mautic.lead_channel_subscription_changed':
      console.log('Subscription changed:', event.channel, event.old_status, '->', event.new_status);
      break;

    case 'mautic.lead_company_change':
      console.log(event.added ? 'Contact added to company' : 'Contact removed from company');
      break;

    case 'mautic.company_post_save':
      console.log('Company saved:', event.company?.id);
      break;

    case 'mautic.company_post_delete':
      console.log('Company deleted:', event.id);
      break;

    case 'mautic.email_on_send':
      console.log('Email sent to contact:', event.contact?.id);
      break;

    case 'mautic.email_on_open':
      console.log('Email opened by contact:', event.contact?.id);
      break;

    case 'mautic.form_on_submit':
      console.log('Form submitted:', event.submission?.id);
      // TODO: Create a ticket, notify sales, etc.
      break;

    case 'mautic.page_on_hit':
      console.log('Page hit:', event.hit?.id);
      break;

    case 'mautic.sms_on_send':
      console.log('SMS sent:', event.smsId);
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyMauticWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mautic`);
  });
}
