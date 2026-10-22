// Generated with: todoist-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Delivery IDs already processed. Use a shared store (Redis, DB) in production.
const seenDeliveries = new Set();

/**
 * Verify Todoist webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Todoist-Hmac-SHA256 header value (base64)
 * @param {string} clientSecret - Todoist app client_secret
 * @returns {boolean}
 */
function verifyTodoistWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader || !clientSecret) return false;
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // length mismatch
  }
}

// express.raw with '*/*' keeps the body as a Buffer whatever the Content-Type is
app.post('/webhooks/todoist',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-todoist-hmac-sha256'];
    const deliveryId = req.headers['x-todoist-delivery-id'];

    if (!Buffer.isBuffer(req.body) || !verifyTodoistWebhook(req.body, signature, process.env.TODOIST_CLIENT_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Retries reuse the same X-Todoist-Delivery-ID
    if (deliveryId && seenDeliveries.has(deliveryId)) {
      return res.status(200).send('Duplicate');
    }
    if (deliveryId) seenDeliveries.add(deliveryId);

    const { event_name: eventName, event_data: data, user_id: userId } = event;
    console.log(`Received ${eventName} for user ${userId}`);

    switch (eventName) {
      case 'item:added':
        console.log('Task added:', data.id, data.content);
        break;
      case 'item:updated':
        console.log('Task updated:', data.id);
        break;
      case 'item:completed':
        console.log('Task completed:', data.id);
        break;
      case 'item:uncompleted':
        console.log('Task uncompleted:', data.id);
        break;
      case 'item:deleted':
        console.log('Task deleted:', data.id);
        break;
      case 'note:added':
        console.log('Comment added:', data.id);
        break;
      case 'project:added':
        console.log('Project added:', data.id, data.name);
        break;
      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    // Todoist treats anything other than 200 as a failed delivery
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyTodoistWebhook, seenDeliveries };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/todoist`);
  });
}
