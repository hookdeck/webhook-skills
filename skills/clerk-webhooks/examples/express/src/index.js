// Generated with: clerk-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Clerk webhook endpoint
// IMPORTANT: Use express.raw() to get raw body for signature verification
app.post('/webhooks/clerk',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // Get Svix headers
    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];

    // Verify required headers are present
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({
        error: 'Missing required Svix headers'
      });
    }

    // Verify signature
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret || !secret.startsWith('whsec_')) {
      console.error('Invalid webhook secret configuration');
      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    try {
      // Construct the signed content
      const signedContent = `${svixId}.${svixTimestamp}.${req.body}`;

      // Extract the base64 secret (everything after 'whsec_')
      const secretBytes = Buffer.from(secret.split('_')[1], 'base64');

      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

      // Svix can send multiple signatures separated by spaces
      // Each signature is in format "v1,actualSignature"
      const signatures = svixSignature.split(' ').map(sig => sig.split(',')[1]);

      // Use timing-safe comparison
      const isValid = signatures.some(sig => {
        try {
          return crypto.timingSafeEqual(
            Buffer.from(sig),
            Buffer.from(expectedSignature)
          );
        } catch (err) {
          // timingSafeEqual throws if buffers are different lengths
          return false;
        }
      });

      if (!isValid) {
        return res.status(400).json({
          error: 'Invalid signature'
        });
      }

      // Check timestamp to prevent replay attacks (5 minute window)
      const timestamp = parseInt(svixTimestamp, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      const fiveMinutes = 5 * 60;

      if (currentTime - timestamp > fiveMinutes) {
        return res.status(400).json({
          error: 'Timestamp too old'
        });
      }

      // Parse the verified event
      const event = JSON.parse(req.body.toString());

      // Handle different event types
      console.log(`Received Clerk webhook: ${event.type}`);

      switch (event.type) {
        case 'user.created':
          console.log('New user created:', {
            userId: event.data.id,
            email: event.data.email_addresses?.[0]?.email_address
          });
          // TODO: Add your user creation logic here
          break;

        case 'user.updated':
          console.log('User updated:', {
            userId: event.data.id
          });
          // TODO: Add your user update logic here
          break;

        case 'user.deleted':
          console.log('User deleted:', {
            userId: event.data.id
          });
          // TODO: Add your user deletion logic here
          break;

        case 'session.created':
          console.log('Session created:', {
            sessionId: event.data.id,
            userId: event.data.user_id
          });
          // TODO: Add your session creation logic here
          break;

        case 'session.ended':
          console.log('Session ended:', {
            sessionId: event.data.id,
            userId: event.data.user_id
          });
          // TODO: Add your session end logic here
          break;

        case 'organization.created':
          console.log('Organization created:', {
            orgId: event.data.id,
            name: event.data.name
          });
          // TODO: Add your organization creation logic here
          break;

        default:
          console.log('Unhandled event type:', event.type);
      }

      // Return success response
      res.status(200).json({
        success: true,
        type: event.type
      });

    } catch (err) {
      console.error('Webhook processing error:', err);
      res.status(400).json({
        error: 'Invalid webhook payload'
      });
    }
  }
);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Clerk webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/clerk`);
});

// For testing
module.exports = { app, server };