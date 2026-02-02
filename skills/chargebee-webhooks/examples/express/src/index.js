require('dotenv').config();
const express = require('express');

// Validate required environment variables at startup
const requiredEnvVars = ['CHARGEBEE_WEBHOOK_USERNAME', 'CHARGEBEE_WEBHOOK_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please set these variables in your .env file or environment');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Middleware to verify Chargebee webhook Basic Auth
 */
function verifyChargebeeAuth(req, res, next) {
  const auth = req.headers.authorization;

  // Check if Authorization header exists
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).send('Unauthorized');
  }

  // Decode Base64
  const encoded = auth.substring(6);
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

  // Split username:password (handle colons in password)
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    return res.status(401).send('Invalid authorization format');
  }

  const username = decoded.substring(0, colonIndex);
  const password = decoded.substring(colonIndex + 1);

  // Verify credentials against environment variables
  const expectedUsername = process.env.CHARGEBEE_WEBHOOK_USERNAME;
  const expectedPassword = process.env.CHARGEBEE_WEBHOOK_PASSWORD;

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).send('Invalid credentials');
  }

  next();
}

// Webhook endpoint with JSON parsing and auth verification
app.post('/webhooks/chargebee', express.json(), verifyChargebeeAuth, (req, res) => {
  const event = req.body;

  // Log event details
  console.log(`Received Chargebee webhook:`, {
    id: event.id,
    event_type: event.event_type,
    occurred_at: event.occurred_at
  });

  // Handle specific event types
  switch (event.event_type) {
    case 'subscription_created':
      console.log('New subscription created:', event.content?.subscription?.id);
      // TODO: Provision user access, send welcome email, etc.
      break;

    case 'subscription_updated':
      console.log('Subscription updated:', event.content?.subscription?.id);
      // TODO: Update user permissions, sync subscription data
      break;

    case 'subscription_cancelled':
      console.log('Subscription cancelled:', event.content?.subscription?.id);
      // TODO: Schedule access revocation, trigger retention flow
      break;

    case 'subscription_reactivated':
      console.log('Subscription reactivated:', event.content?.subscription?.id);
      // TODO: Restore user access
      break;

    case 'payment_initiated':
      console.log('Payment initiated:', event.content?.transaction?.id);
      // TODO: Track payment process, update status
      break;

    case 'payment_collection_failed':
      console.log('Payment collection failed:', event.content?.transaction?.id);
      // TODO: Send payment failure notification, retry logic
      break;

    case 'invoice_generated':
      console.log('Invoice generated:', event.content?.invoice?.id);
      // TODO: Send invoice to customer
      break;

    case 'customer_created':
      console.log('Customer created:', event.content?.customer?.id);
      // TODO: Create user account, sync customer data
      break;

    default:
      console.log('Unhandled event type:', event.event_type);
  }

  // Always return 200 to acknowledge receipt
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Start server only if not in test mode
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`Chargebee webhook server running on port ${PORT}`);
  });
}

// For testing
module.exports = { app, server };