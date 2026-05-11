// Generated with: slack-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Slack Events API request.
 *
 * Slack signs `v0:{timestamp}:{raw_body}` with HMAC-SHA256 using the app's
 * signing secret and sends the result as `X-Slack-Signature: v0=<hex>`.
 *
 * @param {string} rawBody - Raw request body as UTF-8 string
 * @param {string} signatureHeader - X-Slack-Signature header value (e.g. "v0=abc...")
 * @param {string} timestampHeader - X-Slack-Request-Timestamp header value (Unix seconds)
 * @param {string} signingSecret - Slack App signing secret
 * @returns {boolean}
 */
function verifySlackRequest(rawBody, signatureHeader, timestampHeader, signingSecret) {
  if (!signatureHeader || !timestampHeader || !signingSecret) {
    return false;
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  // Replay protection: reject requests older than 5 minutes
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 60 * 5) {
    return false;
  }

  // Slack signs the literal string: "v0:" + timestamp + ":" + raw body
  const basestring = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(basestring, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Slack webhook endpoint — must use raw body for signature verification
app.post('/webhooks/slack',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-slack-signature'];
    const timestamp = req.headers['x-slack-request-timestamp'];
    const rawBody = req.body.toString('utf8');

    if (!verifySlackRequest(rawBody, signature, timestamp, process.env.SLACK_SIGNING_SECRET)) {
      console.error('Slack signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // One-time url_verification challenge when configuring the Request URL
    if (payload.type === 'url_verification') {
      return res.status(200).json({ challenge: payload.challenge });
    }

    if (payload.type === 'event_callback') {
      const event = payload.event || {};

      console.log(`Received ${event.type} (event_id: ${payload.event_id})`);

      switch (event.type) {
        case 'app_mention':
          console.log(`Mentioned by ${event.user} in ${event.channel}: ${event.text}`);
          // TODO: Reply via chat.postMessage
          break;

        case 'message':
          console.log(`Message from ${event.user} in ${event.channel}: ${event.text}`);
          // TODO: Moderation, logging, automation
          break;

        case 'reaction_added':
          console.log(`Reaction :${event.reaction}: added by ${event.user}`);
          // TODO: Approval workflows, polls
          break;

        case 'reaction_removed':
          console.log(`Reaction :${event.reaction}: removed by ${event.user}`);
          break;

        case 'team_join':
          console.log(`New team member joined: ${event.user?.id || event.user}`);
          // TODO: Onboarding DM, CRM sync
          break;

        case 'member_joined_channel':
          console.log(`${event.user} joined channel ${event.channel}`);
          break;

        case 'app_home_opened':
          console.log(`App home opened by ${event.user}`);
          // TODO: Publish the App Home view
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    }

    // Slack requires a 2xx response within 3 seconds, or it will retry
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifySlackRequest };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/slack`);
  });
}
