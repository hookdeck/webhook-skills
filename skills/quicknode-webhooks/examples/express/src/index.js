// Generated with: quicknode-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Nonces of deliveries already handled (catches exact repeats). Use a database or cache with a unique index in production.
const processedNonces = new Set();

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Parse X-QN-Timestamp for the opt-in tolerance check. The docs do not state the unit,
 * so this accepts epoch seconds, epoch milliseconds (>= 1e11) or an ISO 8601 string.
 * @returns {number|null} epoch milliseconds, or null when unparseable
 */
function parseTimestampMs(value) {
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    return n >= 1e11 ? n : n * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Verify a Quicknode Streams / Webhooks delivery.
 * X-QN-Signature is the bare lowercase hex HMAC-SHA256, keyed with the security token (UTF-8),
 * of: X-QN-Nonce + X-QN-Timestamp + raw body, concatenated with no separators.
 * @param {Buffer} rawBody - Raw request body bytes, exactly as received
 * @param {object} headers - Node request headers (lowercase names)
 * @param {string} secret - The stream's or webhook's security token
 * @param {number} [toleranceSeconds] - Opt-in maximum timestamp age; 0 or unset = off
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyQuicknodeWebhook(rawBody, headers, secret, toleranceSeconds = 0) {
  const signature = headers['x-qn-signature'];
  const nonce = headers['x-qn-nonce'];
  const timestamp = headers['x-qn-timestamp'];

  if (!secret) return { valid: false, error: 'No secret configured' };
  if (!signature || !nonce || !timestamp || !Buffer.isBuffer(rawBody)) {
    return { valid: false, error: 'Missing signature, nonce or timestamp header' };
  }
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!HEX_64.test(signature)) {
    return { valid: false, error: 'Malformed signature' };
  }

  // Header values are encoded latin1 and the body is used as the raw bytes received
  const signedContent = Buffer.concat([
    Buffer.from(nonce, 'latin1'),
    Buffer.from(timestamp, 'latin1'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated above: 32 bytes

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Signature mismatch' };
  }

  if (toleranceSeconds > 0) {
    const sentAt = parseTimestampMs(timestamp);
    if (sentAt === null || Math.abs(Date.now() - sentAt) > toleranceSeconds * 1000) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  return { valid: true };
}

// Raw body is required for signature verification (any content type)
app.post('/webhooks/quicknode',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.QUICKNODE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('QUICKNODE_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    const tolerance = Number(process.env.QUICKNODE_WEBHOOK_TOLERANCE_SECONDS) || 0;
    const result = verifyQuicknodeWebhook(req.body, req.headers, secret, tolerance);
    if (!result.valid) {
      console.error(`Webhook verification failed: ${result.error}`);
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Skip a nonce we already handled successfully. This catches exact repeats (Hookdeck retries and
    // replays resend the same headers); Quicknode doesn't document whether its own retries reuse the
    // nonce, so also make processing idempotent on block number/hash and transaction hash.
    const nonce = req.headers['x-qn-nonce'];
    if (processedNonces.has(nonce)) {
      return res.status(200).send('Already processed');
    }

    // Quicknode has no event types. Dispatch on the shape of the payload.
    // ILLUSTRATIVE shapes only: the real payload depends on your stream's dataset or webhook filter.
    if (Array.isArray(payload)) {
      // Webhooks: array of matched items (e.g. transactions)
      console.log(`Webhook delivery with ${payload.length} matched item(s)`);
    } else if (payload && Array.isArray(payload.data) && payload.metadata) {
      // Streams: a batch with `data` and `metadata`
      console.log(`Streams batch: ${payload.data.length} item(s), dataset=${payload.metadata.dataset}, network=${payload.metadata.network}`);
    } else {
      console.log('Unrecognised payload shape');
    }
    // TODO: Persist or enqueue the data, then return 2xx quickly

    processedNonces.add(nonce);
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyQuicknodeWebhook, processedNonces };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/quicknode`);
  });
}
