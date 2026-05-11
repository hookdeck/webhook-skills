// Generated with: gemini-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Gemini webhook signature (Standard Webhooks, HMAC-SHA256).
 *
 * @param {Buffer|string} payload - Raw request body
 * @param {string} webhookId - Value of webhook-id header
 * @param {string} webhookTimestamp - Value of webhook-timestamp header
 * @param {string} webhookSignature - Value of webhook-signature header
 * @param {string} secret - Webhook signing secret (whsec_...)
 * @returns {boolean} Whether the signature is valid
 */
function verifyGeminiSignature(payload, webhookId, webhookTimestamp, webhookSignature, secret) {
  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Reject payloads older than 5 minutes (Standard Webhooks default)
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (timestampDiff > 300 || timestampDiff < -300) {
    console.error('Webhook timestamp too old or too far in the future');
    return false;
  }

  const [version, signature] = webhookSignature.split(',');
  if (version !== 'v1') {
    return false;
  }

  // Signed content: webhook_id.webhook_timestamp.raw_body
  const payloadStr = payload instanceof Buffer ? payload.toString('utf8') : payload;
  const signedContent = `${webhookId}.${webhookTimestamp}.${payloadStr}`;

  // Strip whsec_ prefix and base64-decode the key
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    // Different lengths → invalid
    return false;
  }
}

// Gemini webhook endpoint — must use raw body for signature verification.
app.post('/webhooks/gemini',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const webhookId = req.headers['webhook-id'];
    const webhookTimestamp = req.headers['webhook-timestamp'];
    const webhookSignature = req.headers['webhook-signature'];

    if (!verifyGeminiSignature(
      req.body,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      process.env.GEMINI_WEBHOOK_SECRET
    )) {
      console.error('Gemini webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      console.error('Failed to parse webhook payload:', err);
      return res.status(400).send('Invalid JSON payload');
    }

    switch (event.type) {
      case 'batch.succeeded':
        console.log(`Batch succeeded: ${event.data.id}`);
        console.log(`Output: ${event.data.output_file_uri}`);
        // TODO: Download output, fan out results
        break;

      case 'batch.failed':
        console.log(`Batch failed: ${event.data.id}`);
        console.log(`Error: ${event.data.error_code} ${event.data.error_message}`);
        // TODO: Alert team, decide whether to retry
        break;

      case 'batch.cancelled':
        console.log(`Batch cancelled: ${event.data.id}`);
        // TODO: Clean up resources, update status
        break;

      case 'batch.expired':
        console.log(`Batch expired: ${event.data.id}`);
        // TODO: Resubmit or surface to user
        break;

      case 'video.generated':
        console.log(`Video generated: ${event.data.id}`);
        console.log(`Video file: ${event.data.file_name || event.data.output_file_uri}`);
        // TODO: Fetch the rendered video, notify the user
        break;

      case 'interaction.completed':
        console.log(`Interaction completed: ${event.data.id}`);
        // TODO: Consume LRO result, continue flow
        break;

      case 'interaction.requires_action':
        console.log(`Interaction requires action: ${event.data.id}`);
        // TODO: Run the requested function call, submit the result back
        break;

      case 'interaction.failed':
        console.log(`Interaction failed: ${event.data.id}`);
        console.log(`Error: ${event.data.error_code} ${event.data.error_message}`);
        // TODO: Surface error to user
        break;

      case 'interaction.cancelled':
        console.log(`Interaction cancelled: ${event.data.id}`);
        // TODO: Update UI / state
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Acknowledge receipt quickly — Gemini retries non-2xx for up to 24 hours.
    res.json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/gemini`);
  });
}
