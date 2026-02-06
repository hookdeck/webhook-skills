// Generated with: clerk-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Clerk webhook endpoint
// Clerk uses Standard Webhooks (same as Svix); we verify with the standardwebhooks package.
// IMPORTANT: Use express.raw() to get raw body for signature verification
app.post('/webhooks/clerk',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET || process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    // Clerk/Svix send svix-* headers; standardwebhooks expects webhook-* (same protocol)
    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({
        error: 'Missing required webhook headers (svix-id, svix-timestamp, svix-signature)'
      });
    }

    const headers = {
      'webhook-id': svixId,
      'webhook-timestamp': svixTimestamp,
      'webhook-signature': svixSignature
    };

    try {
      const wh = new Webhook(secret);
      const event = wh.verify(req.body, headers);
      if (!event) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      console.log(`Received Clerk webhook: ${event.type}`);

      switch (event.type) {
        case 'user.created':
          console.log('New user created:', {
            userId: event.data.id,
            email: event.data.email_addresses?.[0]?.email_address
          });
          break;
        case 'user.updated':
          console.log('User updated:', { userId: event.data.id });
          break;
        case 'user.deleted':
          console.log('User deleted:', { userId: event.data.id });
          break;
        case 'session.created':
          console.log('Session created:', {
            sessionId: event.data.id,
            userId: event.data.user_id
          });
          break;
        case 'session.ended':
          console.log('Session ended:', {
            sessionId: event.data.id,
            userId: event.data.user_id
          });
          break;
        case 'organization.created':
          console.log('Organization created:', {
            orgId: event.data.id,
            name: event.data.name
          });
          break;
        default:
          console.log('Unhandled event type:', event.type);
      }

      res.status(200).json({
        success: true,
        type: event.type
      });
    } catch (err) {
      console.error('Webhook verification failed:', err.message || err);
      const message = err.name === 'WebhookVerificationError'
        ? (err.message === 'Message timestamp too old' ? 'Timestamp too old' : err.message === 'No matching signature found' ? 'Invalid signature' : err.message)
        : 'Webhook verification failed';
      res.status(400).json({ error: message });
    }
  }
);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Clerk webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/clerk`);
});

module.exports = { app, server };
