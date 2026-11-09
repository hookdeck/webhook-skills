// Generated with: pylon-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Pylon's docs tell receivers to reject a timestamp more than 5 minutes from now.
// Retries are re-signed with a fresh timestamp, so they pass this check.
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Pylon webhook (X-Pylon-Signature-V2).
 *
 * Pylon signs `timestamp + "." + rawBody` with HMAC-SHA256, keyed with the webhook
 * secret used as-is (do not hex-decode it), and sends the hex digest in
 * X-Pylon-Signature-V2. The timestamp is in X-Pylon-Timestamp (Unix seconds).
 *
 * @param {Buffer} rawBody - Raw, unparsed request body
 * @param {string} timestamp - X-Pylon-Timestamp header
 * @param {string} signature - X-Pylon-Signature-V2 header (hex)
 * @param {string} secret - The webhook secret Pylon showed once at creation
 * @param {number} [nowSeconds] - Current time, injectable for tests
 * @returns {boolean}
 */
function verifyPylonWebhook(rawBody, timestamp, signature, secret, nowSeconds = Date.now() / 1000) {
  if (!timestamp || !signature || !secret) {
    return false;
  }

  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; timingSafeEqual throws on length mismatch.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Pylon webhook endpoint - must use the raw body for signature verification.
// Pylon lets you pick the method per webhook; POST is the default.
app.post('/webhooks/pylon',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const timestamp = req.headers['x-pylon-timestamp'];
    const signature = req.headers['x-pylon-signature-v2'];
    const retryNumber = req.headers['x-pylon-retry-number']; // present on retries only

    if (!verifyPylonWebhook(req.body, timestamp, signature, process.env.PYLON_WEBHOOK_SECRET)) {
      console.error('Pylon webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification succeeds
    const payload = JSON.parse(req.body.toString());

    // Pylon's "Test" button sends this body.
    if (payload.data && payload.data.type === 'ping') {
      console.log('Received Pylon test ping');
      return res.status(200).send('OK');
    }

    // The body is the JSON template you wrote in the trigger's Send webhook
    // action, so these field names are yours. Every value arrives as a string.
    // This example uses the template from Pylon's docs.
    console.log(
      `Received Pylon webhook for issue ${payload.issue_id} (#${payload.number}): ${payload.title}` +
      (retryNumber ? ` [retry ${retryNumber}]` : '')
    );

    // TODO: Pylon sends no event ID, so de-duplicate on fields from your
    // template (for example issue_id plus the field that changed).

    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyPylonWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pylon`);
  });
}
