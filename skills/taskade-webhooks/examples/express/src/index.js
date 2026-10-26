// Generated with: taskade-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Taskade webhook signature
 * @param {Buffer} rawBody - Raw request body (exactly the bytes Taskade signed)
 * @param {string} signatureHeader - X-Taskade-Signature header value (sha256=<hex>)
 * @param {string} secret - Signing secret returned at registration
 * @returns {boolean} - Whether signature is valid
 */
function verifyTaskadeWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Accept the value with or without the "sha256=" prefix
  const sig = signatureHeader.trim().replace(/^sha256=/i, '');

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-f]{64}$/i.test(sig)) {
    return false;
  }

  // HMAC-SHA256 of the raw body only (no timestamp is signed)
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}

// Taskade webhook endpoint. Read the raw body for any content type so the
// signature is computed over the exact bytes Taskade sent.
app.post('/webhooks/taskade',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-taskade-signature'];

    if (!verifyTaskadeWebhook(req.body, signature, process.env.TASKADE_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The docs don't say where a delivery names its event, so read it from the payload
    const event = payload && typeof payload === 'object' ? (payload.event ?? payload.type) : undefined;
    switch (event) {
      case 'task.due':
        console.log('Task due:', payload);
        // TODO: Send a reminder, escalate, etc.
        break;

      case 'task.assigned':
        console.log('Task assigned:', payload);
        // TODO: Notify the assignee
        break;

      case 'comment.created':
        console.log('Comment created:', payload);
        break;

      case 'project.created':
        console.log('Project created:', payload);
        break;

      default:
        console.log(`Unhandled event: ${event ?? 'unknown'}`);
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyTaskadeWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/taskade`);
  });
}
