// Generated with: linear-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Reject deliveries whose webhookTimestamp is more than 1 minute away
// from the server's clock (Linear's recommended replay-protection window).
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 60 * 1000;

/**
 * Verify a Linear webhook signature.
 *
 * Linear computes HMAC-SHA256 over the raw request body using the webhook's
 * signing secret and sends the hex-encoded digest in the `Linear-Signature`
 * header. The header value is a bare hex string — there is no `sha256=`
 * prefix.
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - Linear-Signature header value
 * @param {string} secret - Linear webhook signing secret
 * @returns {boolean}
 */
function verifyLinearWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    // Buffer.from with bad hex (or different lengths in timingSafeEqual)
    return false;
  }
}

/**
 * Check whether a Linear `webhookTimestamp` (UNIX milliseconds) is within the
 * accepted tolerance of the server's clock. Linear recommends rejecting
 * deliveries older than 1 minute to prevent replay attacks.
 */
function isFreshTimestamp(webhookTimestamp, now = Date.now()) {
  if (typeof webhookTimestamp !== 'number') {
    return false;
  }
  return Math.abs(now - webhookTimestamp) <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
}

// Linear webhook endpoint — must use raw body for signature verification.
app.post(
  '/webhooks/linear',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['linear-signature'];
    const event = req.headers['linear-event'];
    const deliveryId = req.headers['linear-delivery'];

    // 1. Verify the signature against the raw body.
    if (!verifyLinearWebhook(req.body, signature, process.env.LINEAR_WEBHOOK_SECRET)) {
      console.error('Linear webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // 2. Parse the payload only after verifying.
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      console.error('Linear webhook payload is not valid JSON');
      return res.status(400).send('Invalid JSON');
    }

    // 3. Reject stale deliveries.
    if (!isFreshTimestamp(payload.webhookTimestamp)) {
      console.error('Linear webhook timestamp is outside the 1 minute window');
      return res.status(400).send('Stale webhook');
    }

    const action = payload.action;
    console.log(`Received Linear ${event} ${action} (delivery: ${deliveryId})`);

    // 4. Route by Linear-Event header.
    switch (event) {
      case 'Issue':
        console.log(`Issue ${action}: ${payload.data?.title}`);
        // TODO: sync issue to external tracker, notify Slack, etc.
        break;

      case 'Comment':
        console.log(`Comment ${action} on issue ${payload.data?.issueId}`);
        // TODO: mirror discussion, bot replies, etc.
        break;

      case 'IssueLabel':
        console.log(`Label ${action}: ${payload.data?.name}`);
        // TODO: tag-based routing, analytics, etc.
        break;

      case 'Project':
        console.log(`Project ${action}: ${payload.data?.name}`);
        // TODO: roadmap dashboard sync, etc.
        break;

      case 'ProjectUpdate':
        console.log(`Project update ${action} on project ${payload.data?.projectId}`);
        // TODO: status report digests, etc.
        break;

      case 'Cycle':
        console.log(`Cycle ${action}: ${payload.data?.name ?? payload.data?.number}`);
        // TODO: sprint dashboards, burndown, etc.
        break;

      case 'Reaction':
        console.log(`Reaction ${action} (${payload.data?.emoji})`);
        // TODO: engagement analytics, etc.
        break;

      case 'IssueSLA':
        console.log(`SLA event on issue ${payload.issueData?.id}`);
        // TODO: escalation, paging, etc.
        break;

      case 'OAuthAppRevoked':
        console.log(`OAuth app revoked: ${payload.oauthClientId}`);
        // TODO: cleanup access tokens, etc.
        break;

      default:
        console.log(`Unhandled Linear event: ${event}`);
    }

    // 5. Acknowledge receipt.
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyLinearWebhook, isFreshTimestamp };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/linear`);
  });
}
