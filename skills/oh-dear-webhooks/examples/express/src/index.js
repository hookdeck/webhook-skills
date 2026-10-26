// Generated with: oh-dear-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the OhDear-Signature header.
 * The header is the bare lowercase hex HMAC-SHA256 of the raw request body,
 * keyed with the team signing secret (used as UTF-8 bytes).
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string} signatureHeader - OhDear-Signature header value
 * @param {string} secret - Team signing secret
 * @returns {boolean}
 */
function verifyOhDearSignature(rawBody, signatureHeader, secret) {
  // Validate format first: Buffer.from(x, 'hex') silently drops bad characters
  if (typeof signatureHeader !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Oh Dear webhook endpoint. express.raw keeps the exact bytes for verification
// whatever the content type is.
app.post('/webhooks/oh-dear', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.OH_DEAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OH_DEAR_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyOhDearSignature(rawBody, req.get('ohdear-signature'), secret)) {
    console.error('Oh Dear signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after the signature check
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).send('Invalid payload');
  }

  // Dispatch on the top-level `type` (nested objects have their own `type` keys).
  // `uuid` is stable across retries and manual resends: use it to deduplicate.
  const { type, uuid } = event;
  console.log(`Received ${type} (uuid: ${uuid})`);

  switch (true) {
    case type === 'monitorAddedNotification':
      console.log(`Monitor added: ${event.monitor?.url}`);
      break;
    case /^(http|tcp|ping)UptimeCheckFailedNotification$/.test(type):
      console.log(`Uptime check failed: ${event.result_url}`);
      break;
    case /^(http|tcp|ping)UptimeCheckRecoveredNotification$/.test(type):
      console.log(`Uptime check recovered: ${event.result_url}`);
      break;
    case type === 'certificateExpiresSoonNotification':
      console.log('Certificate expires soon');
      break;
    case type === 'brokenLinksFoundNotification':
      console.log('Broken links found');
      break;
    case type === 'cronFailedNotification':
      console.log('Scheduled task failed');
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }

  // Oh Dear only treats HTTP 200 as success (redirects fail)
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Oh Dear webhook server listening on port ${port}`);
  });
}

module.exports = { app, verifyOhDearSignature };
