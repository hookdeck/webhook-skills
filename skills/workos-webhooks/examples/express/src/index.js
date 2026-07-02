// Generated with: workos-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { WorkOS } = require('@workos-inc/node');

const workos = new WorkOS(process.env.WORKOS_API_KEY);

const app = express();

// WorkOS webhook endpoint - must use the RAW body for signature verification.
// express.raw() gives us the untouched bytes; passing a parsed object to
// constructEvent would re-serialize it and break the HMAC.
app.post(
  '/webhooks/workos',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sigHeader = req.headers['workos-signature'];

    if (!sigHeader) {
      return res.status(400).send('Missing WorkOS-Signature header');
    }

    let event;
    try {
      // Verify the signature and parse the event using the WorkOS SDK.
      // Throws SignatureVerificationException on tampering or a stale timestamp.
      event = await workos.webhooks.constructEvent({
        payload: req.body, // raw Buffer from express.raw()
        sigHeader,
        secret: process.env.WORKOS_WEBHOOK_SECRET,
      });
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event based on its type (event.event holds the type string).
    switch (event.event) {
      case 'dsync.user.created':
        console.log('Directory user created:', event.data.id);
        // TODO: Provision the user in your app
        break;

      case 'dsync.group.user_added':
        // For this event, data is { directoryId, user, group }.
        console.log(
          'User added to directory group:',
          event.data.user.id,
          '->',
          event.data.group.id
        );
        // TODO: Grant group-based permissions
        break;

      case 'connection.activated':
        console.log('SSO connection activated:', event.data.id);
        // TODO: Enable SSO login for the organization
        break;

      case 'user.created':
        console.log('User created:', event.data.id);
        // TODO: Create a local user record
        break;

      case 'session.created':
        console.log('Session created:', event.data.id);
        // TODO: Audit the login
        break;

      default:
        console.log(`Unhandled event type: ${event.event}`);
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true });
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/workos`);
  });
}
