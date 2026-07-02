// Generated with: bitbucket-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Bitbucket webhook signature
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Hub-Signature header value (format: sha256=<hex>)
 * @param {string} secret - Bitbucket webhook secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyBitbucketWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  // Header format: sha256=<hex>. Split on "=" to separate method and signature.
  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) {
    return false;
  }

  // Compute expected signature over the raw body
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

// Bitbucket webhook endpoint - must use raw body for signature verification
app.post('/webhooks/bitbucket',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-hub-signature'];
    const event = req.headers['x-event-key'];
    const requestUuid = req.headers['x-request-uuid'];

    // Verify webhook signature
    if (!verifyBitbucketWebhook(req.body, signature, process.env.BITBUCKET_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString());

    console.log(`Received ${event} event (uuid: ${requestUuid})`);

    // Handle the event based on the X-Event-Key
    switch (event) {
      case 'repo:push': {
        const change = payload.push?.changes?.[0];
        const name = change?.new?.name || change?.old?.name;
        console.log(`Push to ${name}:`, change?.commits?.[0]?.message);
        // TODO: Trigger CI/CD, run tests, deploy, etc.
        break;
      }

      case 'pullrequest:created':
        console.log(`PR #${payload.pullrequest.id} created:`, payload.pullrequest.title);
        // TODO: Assign reviewers, run checks, etc.
        break;

      case 'pullrequest:updated':
        console.log(`PR #${payload.pullrequest.id} updated:`, payload.pullrequest.title);
        // TODO: Re-run checks, notify reviewers, etc.
        break;

      case 'pullrequest:approved':
        console.log(`PR #${payload.pullrequest.id} approved by ${payload.approval?.user?.display_name}`);
        // TODO: Merge gating, notifications, etc.
        break;

      case 'pullrequest:fulfilled':
        console.log(`PR #${payload.pullrequest.id} merged:`, payload.pullrequest.title);
        // TODO: Deploy, notify, close linked issues, etc.
        break;

      case 'pullrequest:rejected':
        console.log(`PR #${payload.pullrequest.id} declined:`, payload.pullrequest.title);
        // TODO: Cleanup, notify author, etc.
        break;

      case 'pullrequest:comment_created':
        console.log(`Comment on PR #${payload.pullrequest.id}:`, payload.comment?.content?.raw);
        // TODO: Bot responses, command parsing, etc.
        break;

      case 'issue:created':
        console.log(`Issue #${payload.issue.id} created:`, payload.issue.title);
        // TODO: Triage, label, notify, etc.
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
module.exports = { app, verifyBitbucketWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bitbucket`);
  });
}
