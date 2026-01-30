require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify GitHub webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Hub-Signature-256 header value
 * @param {string} secret - GitHub webhook secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyGitHubWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  // Extract the signature from the header (format: sha256=<hex>)
  const signature = signatureHeader.replace('sha256=', '');

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// GitHub webhook endpoint - must use raw body for signature verification
app.post('/webhooks/github',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];
    const deliveryId = req.headers['x-github-delivery'];

    // Verify webhook signature
    if (!verifyGitHubWebhook(req.body, signature, process.env.GITHUB_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());
    const action = payload.action;

    console.log(`Received ${event} event (delivery: ${deliveryId})`);

    // Handle the event based on type
    switch (event) {
      case 'ping':
        console.log('Ping received:', payload.zen);
        break;

      case 'push':
        console.log(`Push to ${payload.ref}:`, payload.head_commit?.message);
        // TODO: Trigger CI/CD, run tests, deploy, etc.
        break;

      case 'pull_request':
        console.log(`PR #${payload.number} ${action}:`, payload.pull_request.title);
        // TODO: Run checks, notify reviewers, auto-merge, etc.
        break;

      case 'issues':
        console.log(`Issue #${payload.issue.number} ${action}:`, payload.issue.title);
        // TODO: Triage, label, notify, etc.
        break;

      case 'issue_comment':
        console.log(`Comment on #${payload.issue.number} by ${payload.comment.user.login}`);
        // TODO: Bot responses, command parsing, etc.
        break;

      case 'release':
        console.log(`Release ${action}:`, payload.release.tag_name);
        // TODO: Deploy, notify, update changelog, etc.
        break;

      case 'create':
        console.log(`Created ${payload.ref_type}:`, payload.ref);
        // TODO: Environment setup, branch protection, etc.
        break;

      case 'delete':
        console.log(`Deleted ${payload.ref_type}:`, payload.ref);
        // TODO: Cleanup, archive, etc.
        break;

      case 'workflow_run':
        console.log(`Workflow "${payload.workflow_run.name}" ${payload.workflow_run.conclusion}`);
        // TODO: Post-CI automation, notifications, etc.
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
module.exports = { app, verifyGitHubWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/github`);
  });
}
