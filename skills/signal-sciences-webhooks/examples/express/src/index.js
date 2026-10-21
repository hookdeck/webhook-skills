// Generated with: signal-sciences-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the X-SigSci-Signature header.
 * The header is the hex HMAC-SHA256 of the raw JSON body, keyed with the
 * integration's signing key (raw string). There is no timestamp or prefix.
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signatureHeader - X-SigSci-Signature header value
 * @param {string} signingKey - Signing key for the integration
 * @returns {boolean}
 */
function verifySignalSciencesWebhook(rawBody, signatureHeader, signingKey) {
  if (!signatureHeader || !signingKey) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch, which means invalid
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Raw body is required: the signature covers the exact bytes Fastly sent
app.post('/webhooks/signal-sciences',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-sigsci-signature'];

    if (!verifySignalSciencesWebhook(req.body, signature, process.env.SIGNAL_SCIENCES_SIGNING_KEY)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse after verification. The event name is the `type` field in the body.
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    console.log(`Received ${event.type} event for ${event.workspaceId}`);

    switch (event.type) {
      case 'flag':
        console.log('IP flagged:', event.payload, event.link);
        // TODO: Alert, add to external blocklist, etc.
        break;

      case 'expireFlag':
        console.log('IP flag expired:', event.payload);
        // TODO: Remove from external blocklist
        break;

      case 'agentAlert':
        console.log('Agent alert:', event.payload);
        // TODO: Page on-call
        break;

      case 'loggingModeChanged':
        console.log('Agent mode changed:', event.payload);
        // TODO: Alert if protection was turned off
        break;

      case 'ruleCreated':
      case 'ruleUpdated':
      case 'ruleDeleted':
        console.log(`Request rule change (${event.type}):`, event.payload);
        // TODO: Record in audit log
        break;

      case 'listCreated':
      case 'listUpdated':
      case 'listDeleted':
        console.log(`List change (${event.type}):`, event.payload);
        break;

      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifySignalSciencesWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/signal-sciences`);
  });
}
