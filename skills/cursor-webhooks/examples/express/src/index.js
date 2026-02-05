require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Verify Cursor webhook signature
function verifyCursorWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Cursor sends: sha256=xxxx
  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const signature = parts[1];
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Cursor webhook endpoint
// CRITICAL: Use express.raw() to get the raw body for signature verification
app.post('/webhooks/cursor',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    // Extract headers
    const signature = req.headers['x-webhook-signature'];
    const webhookId = req.headers['x-webhook-id'];
    const event = req.headers['x-webhook-event'];
    const userAgent = req.headers['user-agent'];

    console.log(`Received webhook: ${event} (ID: ${webhookId})`);

    // Verify signature
    const secret = process.env.CURSOR_WEBHOOK_SECRET;
    if (!verifyCursorWebhook(req.body, signature, secret)) {
      console.error('Signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse the payload after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch (error) {
      console.error('Failed to parse payload:', error);
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Handle the event
    if (event === 'statusChange') {
      console.log(`Agent ${payload.id} status changed to: ${payload.status}`);
      console.log(`Timestamp: ${payload.timestamp}`);

      if (payload.source) {
        console.log(`Repository: ${payload.source.repository}`);
        console.log(`Ref: ${payload.source.ref}`);
      }

      if (payload.target) {
        console.log(`Target URL: ${payload.target.url}`);
        console.log(`Branch: ${payload.target.branchName}`);
        if (payload.target.prUrl) {
          console.log(`PR URL: ${payload.target.prUrl}`);
        }
      }

      if (payload.status === 'FINISHED') {
        console.log(`Summary: ${payload.summary}`);
        // Handle successful completion
        // e.g., update database, notify users, trigger CI/CD
      } else if (payload.status === 'ERROR') {
        console.error(`Agent error for ${payload.id}`);
        // Handle error case
        // e.g., send alerts, retry logic
      }
    }

    // Always respond quickly to webhooks
    res.json({ received: true });
  }
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Webhook error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Cursor webhook server running on port ${PORT}`);

    if (!process.env.CURSOR_WEBHOOK_SECRET) {
      console.warn('WARNING: CURSOR_WEBHOOK_SECRET not set. Webhooks will fail verification.');
    }
  });
}

// Export app for testing
module.exports = app;