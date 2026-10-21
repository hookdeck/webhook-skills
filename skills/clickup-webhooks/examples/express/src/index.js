// Generated with: clickup-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a ClickUp webhook signature.
 * ClickUp sends hex(HMAC-SHA256(webhook.secret, rawBody)) in the X-Signature header.
 * @param {Buffer|string} rawBody - Raw request body, exactly as received
 * @param {string|undefined} signature - X-Signature header value
 * @param {string|undefined} secret - webhook.secret from the Create Webhook API response
 * @returns {boolean} - Whether the signature is valid
 */
function verifyClickUpWebhook(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch, which means invalid
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// ClickUp webhook endpoint - express.raw keeps the body as a Buffer for verification
app.post('/webhooks/clickup',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.get('x-signature');

    // Return 400, not 401: ClickUp suspends a webhook immediately on a 401 response
    if (!signature) {
      return res.status(400).send('Missing X-Signature header');
    }

    if (!verifyClickUpWebhook(req.body, signature, process.env.CLICKUP_WEBHOOK_SECRET)) {
      console.error('ClickUp webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const { event, webhook_id: webhookId } = payload;
    const historyItems = payload.history_items || [];

    // ClickUp recommends {webhook_id}:{history_item_id} as the idempotency key
    const idempotencyKeys = historyItems.map((item) => `${webhookId}:${item.id}`);
    console.log(`Received ${event} (webhook ${webhookId})`, idempotencyKeys);

    // The event name is in the body; ClickUp sends no event header
    switch (event) {
      case 'taskCreated':
        console.log(`Task created: ${payload.task_id}`);
        // TODO: Sync the new task to your system
        break;

      case 'taskUpdated':
        console.log(`Task updated: ${payload.task_id}`);
        // TODO: Fetch the task from the API or apply history_items changes
        break;

      case 'taskDeleted':
        console.log(`Task deleted: ${payload.task_id}`);
        // TODO: Remove mirrored records
        break;

      case 'taskStatusUpdated': {
        const statusItem = historyItems.find((item) => item.field === 'status');
        console.log(
          `Task ${payload.task_id} status: ${statusItem?.before?.status} -> ${statusItem?.after?.status}`
        );
        // TODO: Trigger workflow automation
        break;
      }

      case 'taskAssigneeUpdated':
        console.log(`Task assignee updated: ${payload.task_id}`);
        // TODO: Notify the new assignee
        break;

      case 'taskCommentPosted':
        console.log(`Comment posted on task: ${payload.task_id}`);
        // TODO: Forward the comment to chat
        break;

      case 'listCreated':
      case 'listUpdated':
      case 'listDeleted':
        console.log(`${event}: List ${payload.list_id}`);
        break;

      case 'goalCreated':
      case 'goalUpdated':
      case 'goalDeleted':
        console.log(`${event}: Goal ${payload.goal_id}`);
        break;

      case 'keyResultCreated':
      case 'keyResultUpdated':
      case 'keyResultDeleted':
        console.log(`${event}: Target ${payload.key_result_id}`);
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Respond quickly: ClickUp treats responses slower than 7 seconds as failures
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyClickUpWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/clickup`);
  });
}
