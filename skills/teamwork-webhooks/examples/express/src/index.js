// Generated with: teamwork-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Teamwork (Projects, Version 2) webhook signature.
 * Teamwork sends hex(HMAC-SHA256(token, rawBody)) in the X-Projects-Signature header.
 * @param {Buffer|string} rawBody - Raw request body, exactly as received
 * @param {string|undefined} signature - X-Projects-Signature header value
 * @param {string|undefined} token - Token set on the Version 2 webhook
 * @returns {boolean} - Whether the signature is valid
 */
function verifyTeamworkWebhook(rawBody, signature, token) {
  // Check for exactly 64 hex chars first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!signature || !token || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', token).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

// Teamwork Projects webhook endpoint.
// express.raw with '*/*' keeps the exact bytes for any content type.
app.post(
  '/webhooks/teamwork',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.get('x-projects-signature');

    if (!signature) {
      console.error('Missing X-Projects-Signature header (is this a Version 2 webhook with a token?)');
      return res.status(401).send('Missing signature header');
    }

    // Read the token per request so it can be rotated without a restart
    if (!Buffer.isBuffer(req.body) || !verifyTeamworkWebhook(req.body, signature, process.env.TEAMWORK_WEBHOOK_TOKEN)) {
      console.error('Teamwork webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The event name is in the X-Projects-Event header, e.g. TASK.CREATED
    const event = req.get('x-projects-event');
    const creator = payload.eventCreator;
    console.log(`Received ${event}${creator ? ` from user ${creator.id}` : ''}`);

    switch (event) {
      case 'TASK.CREATED':
        console.log(`Task created: ${payload.task?.id}`);
        // TODO: Sync the new task to your system
        break;

      case 'TASK.UPDATED':
        console.log(`Task updated: ${payload.task?.id}`);
        // TODO: Apply the changes to your mirrored task
        break;

      case 'TASK.COMPLETED':
        console.log(`Task completed: ${payload.task?.id}`);
        // TODO: Trigger downstream automation
        break;

      case 'TASK.DELETED':
        // All delete events share the payload { id, projectId, eventCreator }
        console.log(`Task deleted: ${payload.id}`);
        // TODO: Remove mirrored records
        break;

      case 'PROJECT.CREATED':
        console.log(`Project created: ${payload.project?.id}`);
        // TODO: Provision resources for the project
        break;

      case 'COMMENT.CREATED':
        console.log(`Comment created: ${payload.comment?.id}`);
        // TODO: Forward the comment to chat
        break;

      case 'MILESTONE.COMPLETED':
        console.log(`Milestone completed: ${payload.milestone?.id}`);
        break;

      case 'TIME.CREATED':
        console.log(`Time logged: ${payload.time?.id}`);
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Respond quickly: Teamwork requires a 200 within 5 seconds
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyTeamworkWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/teamwork`);
  });
}
