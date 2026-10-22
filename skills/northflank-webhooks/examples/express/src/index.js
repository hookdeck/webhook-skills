// Generated with: northflank-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const TOKEN_HEADER = 'x-northflank-notification-integration-token';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Northflank does not sign the payload. The secret you set on the notification
 * integration is sent as-is in the X-Northflank-Notification-Integration-Token
 * header; compare it with NORTHFLANK_WEBHOOK_SECRET.
 */
function verifyNorthflankRequest(headers, config = process.env) {
  const secret = config.NORTHFLANK_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured

  const token = headers[TOKEN_HEADER];
  if (!token) return false;
  return safeEqual(token, secret);
}

/**
 * Event names come from Northflank's notification integration trigger list.
 * Only the build payload is shown in the docs; read other payloads defensively.
 */
function handleEvent(payload) {
  const { event, data = {} } = payload;
  const project = data.project?.id;

  switch (event) {
    case 'build:start':
      console.log(`Build started: ${data.build?.id} (${project}/${data.service?.id})`);
      break;

    case 'build:success':
      console.log(`Build succeeded: ${data.build?.id} (${project}/${data.service?.id})`);
      // TODO: trigger a release or notify your team
      break;

    case 'build:failure':
      console.log(`Build failed: ${data.build?.id} (${project}/${data.service?.id})`);
      // TODO: open a ticket or alert the owning team
      break;

    case 'service:deployment:status-update':
      console.log(`Deployment status update in ${project}`);
      // TODO: update your deployment dashboard
      break;

    case 'job-run:failure':
      console.log(`Job run failed in ${project}`);
      // TODO: create a ticket in your bug tracker
      break;

    case 'addon-backup:success':
      console.log(`Backup succeeded in ${project}`);
      // TODO: download the backup via the Northflank API
      break;

    case 'addon-backup:failure':
      console.log(`Backup failed in ${project}`);
      // TODO: alert the owning team
      break;

    case 'billing:invoice-payment-failed':
      console.log('Invoice payment failed');
      // TODO: notify your finance contact
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before anything is parsed.
app.post('/webhooks/northflank', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyNorthflankRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing token' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Northflank event:', err);
    // Northflank resends notifications that don't get a 2xx.
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNorthflankRequest = verifyNorthflankRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/northflank`);
  });
}
