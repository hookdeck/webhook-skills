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

  // The header holds one or more space-delimited "v1,<base64>" entries
  // (several while an old secret is still valid). Accept a match on any.
  const signatures = webhookSignature
    .split(' ')
    .filter((entry) => entry.startsWith('v1,'))
    .map((entry) => entry.slice(3));
  if (signatures.length === 0) {
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

  // Timing-safe comparison against each entry
  const expected = Buffer.from(expectedSignature);
  return signatures.some((signature) => {
    const received = Buffer.from(signature);
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
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
        // Your code: retrieve the job with client.fineTuning.jobs.retrieve(event.data.id)
        break;

      case 'fine_tuning.job.failed':
        console.log(`Fine-tuning job failed: ${event.data.id}`);
        // Your code: retrieve the job for its error, alert the team
        break;

      case 'fine_tuning.job.cancelled':
        console.log(`Fine-tuning job cancelled: ${event.data.id}`);
        // Your code: Clean up resources, update status
        break;

      case 'batch.completed':
        console.log(`Batch completed: ${event.data.id}`);
        // Your code: retrieve the batch with client.batches.retrieve(event.data.id) for its output file
        break;

      case 'batch.failed':
        console.log(`Batch failed: ${event.data.id}`);
        // Your code: retrieve the batch for its errors
        break;

      case 'batch.cancelled':
        console.log(`Batch cancelled: ${event.data.id}`);
        // Your code: Clean up resources, update status
        break;

      case 'batch.expired':
        console.log(`Batch expired: ${event.data.id}`);
        // Your code: Clean up resources, handle timeout
        break;

      case 'realtime.call.incoming':
        console.log(`Realtime call incoming: ${event.data.call_id}`);
        // Your code: accept or reject the call with data.call_id
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