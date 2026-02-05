const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Postmark webhook handler with token authentication
app.post('/webhooks/postmark', express.json(), (req, res) => {
  // Verify authentication token
  const token = req.query.token;

  if (token !== process.env.POSTMARK_WEBHOOK_TOKEN) {
    console.error('Invalid webhook token');
    return res.status(401).send('Unauthorized');
  }

  // Validate payload structure
  const event = req.body;

  if (!event.RecordType || !event.MessageID) {
    console.error('Invalid payload structure:', event);
    return res.status(400).send('Invalid payload structure');
  }

  // Process the event based on type
  console.log(`Received ${event.RecordType} event for message ${event.MessageID}`);

  switch (event.RecordType) {
    case 'Bounce':
      handleBounce(event);
      break;

    case 'SpamComplaint':
      handleSpamComplaint(event);
      break;

    case 'Open':
      handleOpen(event);
      break;

    case 'Click':
      handleClick(event);
      break;

    case 'Delivery':
      handleDelivery(event);
      break;

    case 'SubscriptionChange':
      handleSubscriptionChange(event);
      break;

    default:
      console.log(`Unknown event type: ${event.RecordType}`);
  }

  // Always return 200 to acknowledge receipt
  res.sendStatus(200);
});

// Event handlers
function handleBounce(event) {
  console.log(`Bounce: ${event.Email}`);
  console.log(`  Type: ${event.Type}`);
  console.log(`  Description: ${event.Description}`);
  console.log(`  Bounced at: ${event.BouncedAt}`);

  // In a real application:
  // - Mark email as undeliverable in your database
  // - Update contact status
  // - Trigger re-engagement workflow
}

function handleSpamComplaint(event) {
  console.log(`Spam complaint: ${event.Email}`);
  console.log(`  Complained at: ${event.BouncedAt}`);

  // In a real application:
  // - Remove from all mailing lists immediately
  // - Log for compliance tracking
  // - Update sender reputation metrics
}

function handleOpen(event) {
  console.log(`Email opened: ${event.Email}`);
  console.log(`  Opened at: ${event.ReceivedAt}`);
  console.log(`  Platform: ${event.Platform}`);
  console.log(`  User Agent: ${event.UserAgent}`);

  // In a real application:
  // - Track engagement metrics
  // - Update last activity timestamp
  // - Trigger engagement-based automation
}

function handleClick(event) {
  console.log(`Link clicked: ${event.Email}`);
  console.log(`  Clicked at: ${event.ClickedAt}`);
  console.log(`  Link: ${event.OriginalLink}`);
  console.log(`  Click location: ${event.ClickLocation}`);

  // In a real application:
  // - Track click-through rates
  // - Log user behavior
  // - Trigger click-based automation
}

function handleDelivery(event) {
  console.log(`Email delivered: ${event.Email}`);
  console.log(`  Delivered at: ${event.DeliveredAt}`);
  console.log(`  Server: ${event.ServerID}`);

  // In a real application:
  // - Update delivery status
  // - Log successful delivery
  // - Clear any retry flags
}

function handleSubscriptionChange(event) {
  console.log(`Subscription change: ${event.Email}`);
  console.log(`  Changed at: ${event.ChangedAt}`);
  console.log(`  Suppression reason: ${event.SuppressionReason}`);

  // In a real application:
  // - Update subscription preferences
  // - Log for compliance
  // - Trigger preference center update
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'postmark-webhook-handler' });
});

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Postmark webhook handler listening on port ${port}`);
    console.log(`Webhook endpoint: POST /webhooks/postmark?token=<your-token>`);
  });
}

module.exports = app;