const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({ status: 'Replicate webhook handler running' });
});

/**
 * Verify Replicate webhook signature
 */
function verifyReplicateSignature(body, headers, secret) {
  const webhookId = headers['webhook-id'];
  const webhookTimestamp = headers['webhook-timestamp'];
  const webhookSignature = headers['webhook-signature'];

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new Error('Missing required webhook headers');
  }

  // Extract the key from the secret (remove 'whsec_' prefix)
  const key = Buffer.from(secret.split('_')[1], 'base64');

  // Create the signed content
  const bodyString = Buffer.isBuffer(body) ? body.toString() : body;
  const signedContent = `${webhookId}.${webhookTimestamp}.${bodyString}`;

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', key)
    .update(signedContent)
    .digest('base64');

  // Parse signatures (can be multiple, space-separated)
  const signatures = webhookSignature.split(' ').map(sig => {
    // Handle format: v1,signature
    const parts = sig.split(',');
    return parts.length > 1 ? parts[1] : sig;
  });

  // Debug logging
  if (process.env.DEBUG) {
    console.log('Webhook verification debug:', {
      signatures,
      expectedSignature,
      bodyLength: bodyString.length,
      signedContentPreview: signedContent.substring(0, 100) + '...'
    });
  }

  // Verify at least one signature matches
  const isValid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false; // Different lengths = not equal
    }
  });

  // Verify timestamp is recent (prevent replay attacks)
  const timestamp = parseInt(webhookTimestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - timestamp > 300) { // 5 minutes
    throw new Error('Timestamp too old');
  }

  return isValid;
}

/**
 * Replicate webhook handler
 * CRITICAL: Must use express.raw() to preserve raw body for signature verification
 */
app.post('/webhooks/replicate',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const startTime = Date.now();

    try {
      // Verify webhook signature
      const secret = process.env.REPLICATE_WEBHOOK_SECRET;
      if (!secret) {
        console.error('REPLICATE_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }

      const isValid = verifyReplicateSignature(req.body, req.headers, secret);
      if (!isValid) {
        console.warn('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }

      // Parse the verified webhook body
      const prediction = JSON.parse(req.body.toString());
      console.log(`Received prediction webhook:`, {
        id: prediction.id,
        status: prediction.status,
        version: prediction.version,
        timestamp: new Date().toISOString()
      });

      // Handle the prediction based on its status
      switch (prediction.status) {
        case 'starting':
          console.log('Prediction starting:', {
            id: prediction.id,
            input: prediction.input,
            createdAt: prediction.created_at
          });
          break;

        case 'processing':
          console.log('Prediction processing:', {
            id: prediction.id,
            logs: prediction.logs ? `${prediction.logs.length} log entries` : 'no logs yet'
          });
          break;

        case 'succeeded':
          console.log('Prediction succeeded:', {
            id: prediction.id,
            output: Array.isArray(prediction.output)
              ? `Array with ${prediction.output.length} items`
              : typeof prediction.output,
            duration: prediction.metrics?.predict_time,
            urls: prediction.urls
          });
          break;

        case 'failed':
          console.log('Prediction failed:', {
            id: prediction.id,
            error: prediction.error
          });
          break;

        case 'canceled':
          console.log('Prediction canceled:', {
            id: prediction.id
          });
          break;

        default:
          console.log('Unknown prediction status:', prediction.status);
      }

      // Process the event (add your business logic here)
      // For example:
      // - Update database with prediction status
      // - Notify users about completion
      // - Process and store the output

      const processingTime = Date.now() - startTime;
      res.status(200).json({
        received: true,
        predictionStatus: prediction.status,
        processingTime: `${processingTime}ms`
      });

    } catch (error) {
      console.error('Webhook processing error:', error);

      if (error.message === 'Missing required webhook headers') {
        return res.status(400).json({ error: 'Missing required webhook headers' });
      }

      if (error.message === 'Timestamp too old') {
        return res.status(400).json({ error: 'Webhook timestamp too old' });
      }

      // Don't expose internal errors
      res.status(400).json({ error: 'Invalid webhook' });
    }
  }
);

// JSON parsing for other routes (must be after webhook route)
app.use(express.json());

// Start server only if not in test environment
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`Replicate webhook handler listening on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/replicate`);

    if (!process.env.REPLICATE_WEBHOOK_SECRET) {
      console.warn('⚠️  REPLICATE_WEBHOOK_SECRET not set in environment variables');
    }
  });
}

// For testing
module.exports = { app, server };