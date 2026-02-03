// Generated with: openai-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify OpenAI webhook signature using Standard Webhooks
 * @param {Buffer|string} payload - Raw request body
 * @param {string} webhookId - Value of webhook-id header
 * @param {string} webhookTimestamp - Value of webhook-timestamp header
 * @param {string} webhookSignature - Value of webhook-signature header
 * @param {string} secret - Webhook signing secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyOpenAISignature(payload, webhookId, webhookTimestamp, webhookSignature, secret) {
  if (!webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Check timestamp is within 5 minutes to prevent replay attacks
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (timestampDiff > 300 || timestampDiff < -300) {
    console.error('Webhook timestamp too old or too far in the future');
    return false;
  }

  // Extract version and signature
  const [version, signature] = webhookSignature.split(',');
  if (version !== 'v1') {
    return false;
  }

  // Create signed content: webhook_id.webhook_timestamp.payload
  const payloadStr = payload instanceof Buffer ? payload.toString('utf8') : payload;
  const signedContent = `${webhookId}.${webhookTimestamp}.${payloadStr}`;

  // Decode base64 secret (remove whsec_ prefix if present)
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    // Buffers have different lengths
    return false;
  }
}

// OpenAI webhook endpoint - must use raw body for signature verification
app.post('/webhooks/openai',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const webhookId = req.headers['webhook-id'];
    const webhookTimestamp = req.headers['webhook-timestamp'];
    const webhookSignature = req.headers['webhook-signature'];

    // Verify webhook signature
    if (!verifyOpenAISignature(
      req.body,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      process.env.OPENAI_WEBHOOK_SECRET
    )) {
      console.error('OpenAI webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the verified payload
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      console.error('Failed to parse webhook payload:', err);
      return res.status(400).send('Invalid JSON payload');
    }

    // Handle the event based on type
    switch (event.type) {
      case 'fine_tuning.job.succeeded':
        console.log(`Fine-tuning job succeeded: ${event.data.id}`);
        console.log(`Fine-tuned model: ${event.data.fine_tuned_model}`);
        // TODO: Deploy model, notify team, update database
        break;

      case 'fine_tuning.job.failed':
        console.log(`Fine-tuning job failed: ${event.data.id}`);
        console.log(`Error: ${event.data.error?.message}`);
        // TODO: Alert team, log error, retry if appropriate
        break;

      case 'fine_tuning.job.cancelled':
        console.log(`Fine-tuning job cancelled: ${event.data.id}`);
        // TODO: Clean up resources, update status
        break;

      case 'batch.completed':
        console.log(`Batch completed: ${event.data.id}`);
        console.log(`Output file: ${event.data.output_file_id}`);
        // TODO: Download results, process output, trigger next steps
        break;

      case 'batch.failed':
        console.log(`Batch failed: ${event.data.id}`);
        console.log(`Error: ${event.data.errors}`);
        // TODO: Handle errors, retry failed items
        break;

      case 'batch.cancelled':
        console.log(`Batch cancelled: ${event.data.id}`);
        // TODO: Clean up resources, update status
        break;

      case 'batch.expired':
        console.log(`Batch expired: ${event.data.id}`);
        // TODO: Clean up resources, handle timeout
        break;

      case 'realtime.call.incoming':
        console.log(`Realtime call incoming: ${event.data.id}`);
        // TODO: Handle incoming call, connect client
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
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
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/openai`);
  });
}