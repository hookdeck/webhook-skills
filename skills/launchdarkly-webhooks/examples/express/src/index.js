// Generated with: launchdarkly-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify X-LD-Signature: HMAC-SHA256 hex digest of the raw body, keyed with the webhook secret.
 */
function verifyLaunchDarklyWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // timingSafeEqual throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Raw body is required: the signature covers the exact bytes LaunchDarkly sent
app.post('/webhooks/launchdarkly',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.LAUNCHDARKLY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('LAUNCHDARKLY_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-ld-signature'];
    if (!signature) {
      // Signing is optional in LaunchDarkly; the webhook must have a secret
      return res.status(400).send('Missing X-LD-Signature header');
    }

    if (!Buffer.isBuffer(req.body) || !verifyLaunchDarklyWebhook(req.body, signature, secret)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // The payload is an audit log entry; the event type is `kind`
    const action = payload.accesses?.[0]?.action;
    console.log(`Received ${payload.kind} change (${action}), id ${payload._id}`);

    switch (payload.kind) {
      case 'flag':
        console.log(`Flag "${payload.name}": ${payload.titleVerb}`);
        // TODO: sync flag state, notify team, update ticket
        break;

      case 'segment':
        console.log(`Segment "${payload.name}": ${payload.titleVerb}`);
        // TODO: invalidate caches
        break;

      case 'project':
        console.log(`Project "${payload.name}": ${payload.titleVerb}`);
        break;

      case 'environment':
        console.log(`Environment "${payload.name}": ${payload.titleVerb}`);
        break;

      default:
        console.log(`Unhandled kind: ${payload.kind}`);
    }

    // Dedupe on payload._id; delivery order is not guaranteed (use payload.date)
    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyLaunchDarklyWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/launchdarkly`);
  });
}
