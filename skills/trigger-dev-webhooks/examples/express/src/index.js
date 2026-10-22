require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Trigger.dev alert webhook signature.
 * The x-trigger-signature-hmacsha256 header is the bare hex HMAC-SHA256 of the
 * raw request body, keyed with the alert webhook secret as UTF-8.
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signatureHeader - x-trigger-signature-hmacsha256 header value
 * @param {string} secret - Alert webhook secret
 * @returns {boolean}
 */
function verifyTriggerDevWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // timingSafeEqual throws when lengths differ, so treat that as invalid
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Read the raw body for any content type so the signature always verifies
app.post('/webhooks/trigger-dev',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-trigger-signature-hmacsha256'];

    if (!signature) {
      return res.status(400).send('Missing signature header');
    }

    if (!verifyTriggerDevWebhook(req.body, signature, process.env.TRIGGER_DEV_WEBHOOK_SECRET)) {
      console.error('Trigger.dev webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The event type is in the body (there is no event-type header)
    switch (event.type) {
      case 'alert.run.failed': {
        const { run, task } = event.object;
        console.log(`Run ${run.id} of task ${task.id} failed:`, run.dashboardUrl);
        // TODO: Page on-call, open an incident, retry downstream work, etc.
        break;
      }

      case 'alert.deployment.success': {
        const { deployment, environment } = event.object;
        console.log(`Deployment ${deployment.version} succeeded in ${environment.type}`);
        // TODO: Post to Slack, update a status page, etc.
        break;
      }

      case 'alert.deployment.failed': {
        const { deployment, error } = event.object;
        console.log(`Deployment ${deployment.version} failed:`, error.message);
        // TODO: Notify the author, open a ticket, etc.
        break;
      }

      case 'alert.error': {
        const { classification, error } = event.object;
        console.log(`Error group alert (${classification}):`, error.message);
        // TODO: Create an issue for the new error group or regression
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyTriggerDevWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/trigger-dev`);
  });
}
