require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a FireHydrant webhook signature.
 * fh-signature is the bare hex HMAC-SHA256 of the raw request body, keyed with the webhook Secret.
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signature - fh-signature header value
 * @param {string} secret - Webhook Secret
 * @returns {boolean}
 */
function verifyFireHydrantWebhook(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; unequal lengths would make timingSafeEqual throw
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// express.raw with '*/*' keeps the raw bytes whatever Content-Type FireHydrant sends
app.post('/webhooks/firehydrant',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['fh-signature'];

    if (!verifyFireHydrantWebhook(req.body, signature, process.env.FIREHYDRANT_WEBHOOK_SECRET)) {
      console.error('FireHydrant signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const resourceType = payload.event?.resource_type;
    // Operation casing varies (UPDATED vs updated), so normalise it
    const operation = String(payload.event?.operation ?? '').toUpperCase();

    switch (resourceType) {
      case 'incident': {
        const incident = payload.data?.incident;
        console.log(`Incident #${incident?.number} ${operation}: ${incident?.name} (${incident?.current_milestone})`);
        // TODO: Sync to ticketing, post status updates, etc.
        break;
      }

      case 'change_event':
        console.log(`Change event ${operation}: ${payload.data?.summary}`);
        // TODO: Track deploys, correlate with incidents, etc.
        break;

      case 'signals_alerts': {
        const alert = payload.data?.alert;
        console.log(`Signals alert ${operation}: ${alert?.summary} (${alert?.status}, decision: ${alert?.decision})`);
        // TODO: Forward alerts, track alert lifecycle, etc.
        break;
      }

      default:
        console.log(`Unhandled resource type: ${resourceType}`);
    }

    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyFireHydrantWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/firehydrant`);
  });
}
