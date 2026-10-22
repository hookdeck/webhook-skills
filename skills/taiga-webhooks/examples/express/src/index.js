// Generated with: taiga-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Taiga webhook signature.
 * Taiga sends the bare hex HMAC-SHA1 of the raw body (key = webhook secret key, UTF-8)
 * in the X-TAIGA-WEBHOOK-SIGNATURE header.
 * @param {Buffer|string} rawBody - Raw request body, exactly as received
 * @param {string|undefined} signature - X-TAIGA-WEBHOOK-SIGNATURE header value
 * @param {string|undefined} secret - The webhook's secret key
 * @returns {boolean} - Whether the signature is valid
 */
function verifyTaigaWebhook(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha1', secret)
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

// Taiga webhook endpoint - express.raw with '*/*' keeps the body as a Buffer
// whatever the Content-Type, so the signature always covers the exact bytes
app.post('/webhooks/taiga',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.get('x-taiga-webhook-signature');

    if (!signature) {
      return res.status(400).send('Missing X-TAIGA-WEBHOOK-SIGNATURE header');
    }

    if (!verifyTaigaWebhook(req.body, signature, process.env.TAIGA_WEBHOOK_SECRET)) {
      console.error('Taiga webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Taiga sends no event header: the event is the body's type + action
    const { type, action, data = {}, by } = payload;
    const label = data.subject || data.name || data.slug || data.id;
    console.log(`Received ${type} ${action} by ${by?.username ?? 'unknown'}`);

    switch (`${type} ${action}`) {
      case 'userstory create':
        console.log(`User story created: ${label}`);
        // TODO: Sync the new user story
        break;

      case 'userstory change':
        console.log(`User story changed: ${label}`);
        // TODO: Inspect payload.change.diff for the edited fields
        break;

      case 'userstory delete':
        console.log(`User story deleted: ${label}`);
        break;

      case 'task create':
        console.log(`Task created: ${label}`);
        break;

      case 'task change':
        console.log(`Task changed: ${label}`);
        break;

      case 'task delete':
        console.log(`Task deleted: ${label}`);
        break;

      case 'issue create':
      case 'issue change':
      case 'issue delete':
        console.log(`${type} ${action}: ${label}`);
        break;

      case 'epic create':
      case 'epic change':
      case 'epic delete':
        console.log(`${type} ${action}: ${label}`);
        break;

      case 'milestone create':
      case 'milestone change':
      case 'milestone delete':
        console.log(`${type} ${action}: ${label}`);
        break;

      case 'wikipage create':
      case 'wikipage change':
      case 'wikipage delete':
        console.log(`${type} ${action}: ${label}`);
        break;

      case 'test test':
        console.log('Taiga test webhook received');
        break;

      default:
        console.log(`Unhandled event: ${type} ${action}`);
    }

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyTaigaWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/taiga`);
  });
}
