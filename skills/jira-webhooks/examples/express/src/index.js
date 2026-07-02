// Generated with: jira-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Jira webhook signature.
 *
 * Jira Cloud signs the raw body with HMAC-SHA256 keyed on the webhook secret and
 * sends it in the X-Hub-Signature header as `sha256=<hex>` (WebSub format).
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Hub-Signature header value (`sha256=<hex>`)
 * @param {string} secret - Jira webhook secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyJiraWebhook(rawBody, signatureHeader, secret) {
  // Split the WebSub `method=signature` header (e.g. `sha256=<hex>`)
  const [method, sig] = (signatureHeader || '').split('=');
  if (method !== 'sha256' || !sig) {
    return false;
  }

  // Compute the expected signature over the raw body
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guards against buffer length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// Jira webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/jira',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-hub-signature'];
    const deliveryId = req.headers['x-atlassian-webhook-identifier'];

    // Verify webhook signature before doing anything else
    if (!verifyJiraWebhook(req.body, signature, process.env.JIRA_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification. Jira has no event-type header —
    // the event name is in the `webhookEvent` field of the body.
    const payload = JSON.parse(req.body.toString());
    const event = payload.webhookEvent;
    const issue = payload.issue;

    console.log(`Received ${event} event (delivery: ${deliveryId})`);

    // Handle the event based on its `webhookEvent` type
    switch (event) {
      case 'jira:issue_created':
        console.log(`Issue created ${issue.key}: ${issue.fields.summary}`);
        // TODO: Sync to external system, auto-assign, notify, etc.
        break;

      case 'jira:issue_updated':
        console.log(`Issue updated ${issue.key}:`, payload.changelog?.items);
        // TODO: Track status changes, trigger automations, etc.
        break;

      case 'jira:issue_deleted':
        console.log(`Issue deleted ${issue.key}`);
        // TODO: Clean up mirrored records, etc.
        break;

      case 'comment_created':
        console.log(`Comment on ${issue.key} by ${payload.comment.author.displayName}`);
        // TODO: ChatOps, notifications, command parsing, etc.
        break;

      case 'comment_updated':
        console.log(`Comment updated on ${issue.key}`);
        // TODO: Audit trails, re-processing, etc.
        break;

      case 'comment_deleted':
        console.log(`Comment deleted on ${issue.key}`);
        // TODO: Audit trails, etc.
        break;

      case 'worklog_created':
        console.log(`Worklog logged on ${issue.key}`);
        // TODO: Time-tracking, billing integrations, etc.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
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
module.exports = { app, verifyJiraWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/jira`);
  });
}
