// Generated with: heroku-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Constant-time string comparison that tolerates length mismatches.
 */
function safeEqual(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false; // Different lengths = invalid
  }
}

/**
 * Verify the Heroku-Webhook-Hmac-SHA256 header.
 * Heroku sends base64(HMAC-SHA256(secret, raw body)); the secret is used as a raw string.
 * @param {Buffer} rawBody - Raw request body
 * @param {string} hmacHeader - Heroku-Webhook-Hmac-SHA256 header value
 * @param {string} secret - Webhook secret
 * @returns {boolean}
 */
function verifyHerokuWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return safeEqual(hmacHeader, expected);
}

// Heroku webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/heroku',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const hmac = req.headers['heroku-webhook-hmac-sha256'];

    if (!verifyHerokuWebhook(req.body, hmac, process.env.HEROKU_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Optional extra: the --authorization value is passed through unmodified
    const expectedAuth = process.env.HEROKU_WEBHOOK_AUTHORIZATION;
    if (expectedAuth && !safeEqual(req.headers['authorization'] || '', expectedAuth)) {
      console.error('Authorization header mismatch');
      return res.status(401).send('Unauthorized');
    }

    // Parse the payload after verification
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Subscriptions use "api:release"; payloads may carry "release". Accept both.
    const resource = String(event.resource || '').replace(/^api:/, '');
    const { action, data = {} } = event;

    console.log(`Received ${resource} ${action} webhook (event ${event.id})`);

    switch (`${resource}:${action}`) {
      case 'release:create':
      case 'release:update':
        console.log(`Release v${data.version} ${action}: status=${data.status}`);
        // TODO: Notify deploy channel, record release, etc.
        break;

      case 'build:create':
      case 'build:update':
        console.log(`Build ${data.id} ${action}: status=${data.status}`);
        // TODO: Track build progress, alert on failure, etc.
        break;

      case 'app:create':
      case 'app:update':
      case 'app:destroy':
        console.log(`App ${data.name} ${action}`);
        // TODO: Sync app inventory, etc.
        break;

      case 'dyno:create':
        console.log(`Dyno started: ${data.name}`);
        // TODO: Track dyno activity, etc.
        break;

      case 'formation:update':
      case 'formation:destroy':
        console.log(`Formation ${data.type} ${action}: quantity=${data.quantity}`);
        // TODO: Track scaling changes, etc.
        break;

      case 'addon-attachment:create':
      case 'addon-attachment:destroy':
        console.log(`Add-on attachment ${data.name} ${action}`);
        // TODO: Update add-on inventory, etc.
        break;

      default:
        console.log(`Unhandled event: ${resource} ${action}`);
    }

    // Heroku ignores the body; any 2xx counts as delivered
    res.status(204).end();
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyHerokuWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/heroku`);
  });
}
