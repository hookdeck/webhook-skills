require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Vercel webhook endpoint
// CRITICAL: Use express.raw() to get the raw body for signature verification
app.post('/webhooks/vercel',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-vercel-signature'];

    if (!signature) {
      console.error('Missing x-vercel-signature header');
      return res.status(400).json({ error: 'Missing x-vercel-signature header' });
    }

    // Verify the webhook signature
    const secret = process.env.VERCEL_WEBHOOK_SECRET;
    if (!secret) {
      console.error('VERCEL_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Compute expected signature using SHA1
    const expectedSignature = crypto
      .createHmac('sha1', secret)
      .update(req.body)
      .digest('hex');

    // Use timing-safe comparison
    let signaturesMatch;
    try {
      signaturesMatch = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      // Buffer lengths don't match = invalid signature
      signaturesMatch = false;
    }

    if (!signaturesMatch) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Parse the verified webhook payload
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      console.error('Invalid JSON payload:', err);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    // Log the event
    console.log(`Received Vercel webhook: ${event.type}`);
    console.log('Event ID:', event.id);
    console.log('Created at:', new Date(event.createdAt).toISOString());

    // Handle different event types
    try {
      switch (event.type) {
        case 'deployment.created':
          console.log('Deployment created:', {
            id: event.payload.deployment?.id,
            name: event.payload.deployment?.name,
            url: event.payload.deployment?.url,
            project: event.payload.project?.name,
            team: event.payload.team?.name
          });
          break;

        case 'deployment.succeeded':
          console.log('Deployment succeeded:', {
            id: event.payload.deployment?.id,
            name: event.payload.deployment?.name,
            url: event.payload.deployment?.url,
            duration: event.payload.deployment?.duration
          });
          break;

        case 'deployment.ready':
          console.log('Deployment ready:', {
            id: event.payload.deployment?.id,
            url: event.payload.deployment?.url
          });
          break;

        case 'deployment.error':
          console.error('Deployment failed:', {
            id: event.payload.deployment?.id,
            name: event.payload.deployment?.name,
            error: event.payload.deployment?.error
          });
          break;

        case 'deployment.canceled':
          console.log('Deployment canceled:', {
            id: event.payload.deployment?.id,
            name: event.payload.deployment?.name
          });
          break;

        case 'deployment.promoted':
          console.log('Deployment promoted:', {
            id: event.payload.deployment?.id,
            name: event.payload.deployment?.name,
            url: event.payload.deployment?.url,
            target: event.payload.deployment?.target
          });
          break;

        case 'project.created':
          console.log('Project created:', {
            id: event.payload.project?.id,
            name: event.payload.project?.name
          });
          break;

        case 'project.removed':
          console.log('Project removed:', {
            id: event.payload.project?.id,
            name: event.payload.project?.name
          });
          break;

        case 'project.renamed':
          console.log('Project renamed:', {
            id: event.payload.project?.id,
            oldName: event.payload.project?.oldName,
            newName: event.payload.project?.name
          });
          break;

        case 'domain.created':
          console.log('Domain created:', {
            domain: event.payload.domain?.name,
            project: event.payload.project?.name
          });
          break;

        case 'integration-configuration.removed':
          console.log('Integration removed:', {
            id: event.payload.configuration?.id,
            integration: event.payload.integration?.name
          });
          break;

        default:
          console.log('Unhandled event type:', event.type);
          console.log('Payload:', JSON.stringify(event.payload, null, 2));
      }

      // Return success response
      res.status(200).json({ received: true });

    } catch (err) {
      console.error('Error processing webhook:', err);
      res.status(500).json({ error: 'Error processing webhook' });
    }
  }
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Vercel webhook server running on port ${port}`);
    console.log(`Webhook endpoint: http://localhost:${port}/webhooks/vercel`);

    if (!process.env.VERCEL_WEBHOOK_SECRET) {
      console.warn('WARNING: VERCEL_WEBHOOK_SECRET not set in environment');
    }
  });
}

module.exports = app;