require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Forgejo webhook signature
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string} signature - X-Forgejo-Signature header (bare hex HMAC-SHA256)
 * @param {string} secret - Forgejo webhook secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyForgejoWebhook(rawBody, signature, secret) {
  // Forgejo sends the header with an empty value when no secret is configured
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest();

  // Format is validated above, so both buffers are 32 bytes
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase(), 'hex'), expected);
}

// Forgejo webhook endpoint - raw body of any content type so the exact bytes are verified
app.post('/webhooks/forgejo',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-forgejo-signature'];
    // X-Forgejo-Event-Type is the exact event type; X-Forgejo-Event is the coarser group
    const event = req.headers['x-forgejo-event-type'] || req.headers['x-forgejo-event'];
    const deliveryId = req.headers['x-forgejo-delivery'];

    if (!Buffer.isBuffer(req.body) || !verifyForgejoWebhook(req.body, signature, process.env.FORGEJO_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid payload');
    }
    if (payload === null || typeof payload !== 'object') {
      return res.status(400).send('Invalid payload');
    }
    const action = payload.action;

    console.log(`Received ${event} event (delivery: ${deliveryId})`);

    switch (event) {
      case 'push':
        console.log(`Push to ${payload.ref} by ${payload.pusher?.login}:`, payload.commits?.[0]?.message);
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
      case 'pull_request_comment':
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
module.exports = { app, verifyForgejoWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/forgejo`);
  });
}
