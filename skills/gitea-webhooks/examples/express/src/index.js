require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Gitea webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - X-Gitea-Signature header (bare hex HMAC-SHA256)
 * @param {string} secret - Gitea webhook secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyGiteaWebhook(rawBody, signature, secret) {
  // Gitea sends the header with an empty value when no secret is configured
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Parse the payload after verification. Gitea sends either JSON or a
 * form-encoded body with the JSON in a `payload` field.
 */
function parsePayload(rawBody, contentType) {
  const text = rawBody.toString('utf8');
  if ((contentType || '').includes('application/x-www-form-urlencoded')) {
    return JSON.parse(new URLSearchParams(text).get('payload'));
  }
  return JSON.parse(text);
}

// Gitea webhook endpoint - raw body of any content type, so the signature
// verifies for both application/json and form-encoded deliveries
app.post('/webhooks/gitea',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-gitea-signature'];
    const event = req.headers['x-gitea-event'];
    const deliveryId = req.headers['x-gitea-delivery'];

    if (!Buffer.isBuffer(req.body) || !verifyGiteaWebhook(req.body, signature, process.env.GITEA_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    let payload;
    try {
      payload = parsePayload(req.body, req.headers['content-type']);
    } catch {
      return res.status(400).send('Invalid payload');
    }
    const action = payload.action;

    console.log(`Received ${event} event (delivery: ${deliveryId})`);

    switch (event) {
      case 'push':
        console.log(`Push to ${payload.ref}:`, payload.head_commit?.message);
        // TODO: Trigger CI/CD, run tests, deploy, etc.
        break;

      case 'pull_request':
        console.log(`PR #${payload.number} ${action}:`, payload.pull_request?.title);
        // TODO: Run checks, notify reviewers, etc.
        break;

      case 'issues':
        console.log(`Issue #${payload.issue?.number} ${action}:`, payload.issue?.title);
        // TODO: Triage, label, notify, etc.
        break;

      case 'issue_comment':
        console.log(`Comment on #${payload.issue?.number} by ${payload.comment?.user?.login}`);
        // TODO: Bot commands, notifications, etc.
        break;

      case 'create':
        console.log(`Created ${payload.ref_type}:`, payload.ref);
        // TODO: Environment setup, etc.
        break;

      case 'delete':
        console.log(`Deleted ${payload.ref_type}:`, payload.ref);
        // TODO: Cleanup, archive, etc.
        break;

      case 'release':
        console.log(`Release ${action}:`, payload.release?.tag_name);
        // TODO: Deploy, notify, update changelog, etc.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyGiteaWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/gitea`);
  });
}
