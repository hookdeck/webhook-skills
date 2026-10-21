// Generated with: zernio-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Event ids already handled. Use a database or cache with a unique index in production.
const processedEvents = new Set();

/**
 * Verify a Zernio webhook signature.
 * X-Zernio-Signature is the lowercase hex HMAC-SHA256 of the raw body, keyed with your secret.
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signatureHeader - X-Zernio-Signature (or legacy X-Late-Signature) value
 * @param {string} secret - The secret you set on the webhook endpoint
 * @returns {boolean}
 */
function verifyZernioWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws when lengths differ
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// Raw body is required for signature verification
app.post('/webhooks/zernio',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-zernio-signature'] || req.headers['x-late-signature'];

    if (!signature) {
      return res.status(401).send('No signature provided');
    }

    if (!verifyZernioWebhook(req.body, signature, process.env.ZERNIO_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Zernio delivers at least once: payload.id (= X-Zernio-Event-Id) is stable across retries
    if (processedEvents.has(payload.id)) {
      return res.status(200).send('Already processed');
    }
    processedEvents.add(payload.id);

    console.log(`Received ${payload.event} event (id: ${payload.id})`);

    switch (payload.event) {
      case 'webhook.test':
        console.log('Test event:', payload.message);
        break;

      case 'post.scheduled':
        console.log(`Post ${payload.post?.id} scheduled for ${payload.post?.scheduledFor}`);
        break;

      case 'post.published':
        console.log(`Post ${payload.post?.id} published`);
        // TODO: Store platforms[].publishedUrl, notify the author, etc.
        break;

      case 'post.partial':
        console.log(`Post ${payload.post?.id} published on some platforms only`);
        // TODO: Retry the failed targets
        break;

      case 'post.failed':
        console.log(`Post ${payload.post?.id} failed on every platform`);
        // TODO: Alert the author, inspect platforms[].errorCategory
        break;

      case 'post.platform.published':
        console.log(`Post ${payload.post?.id} published on one platform`);
        break;

      case 'post.platform.failed':
        console.log(`Post ${payload.post?.id} failed on one platform`);
        break;

      case 'message.received':
        console.log(`Message on ${payload.message?.platform}: ${payload.message?.text}`);
        // TODO: Route to support, reply via the inbox API
        break;

      case 'comment.received':
        console.log(`Comment received on account ${payload.account?.accountId}`);
        break;

      case 'account.connected':
        console.log(`Account connected: ${payload.account?.platform} @${payload.account?.username}`);
        break;

      case 'account.disconnected':
        console.log(`Account disconnected (${payload.account?.disconnectionType}): ${payload.account?.reason}`);
        // TODO: Prompt the user to reconnect
        break;

      default:
        console.log(`Unhandled event: ${payload.event}`);
    }

    // Return 2xx within 5 seconds; do heavy work in the background
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyZernioWebhook, processedEvents };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zernio`);
  });
}
