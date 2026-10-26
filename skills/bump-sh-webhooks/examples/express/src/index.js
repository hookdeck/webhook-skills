// Generated with: bump-sh-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Bump.sh webhook signature.
 *
 * Bump.sh sends `X-Bump-Signature-256: sha256=<hex>` where <hex> is the
 * lowercase hex HMAC-SHA256 of the raw request body, keyed with the webhook's
 * secret token (used as UTF-8 bytes). Only the body is signed, so there is no
 * timestamp to check. A bare 64-hex value (no prefix) is accepted too.
 *
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string|undefined} header - X-Bump-Signature-256 header value
 * @param {string|undefined} secret - Webhook secret token
 * @returns {boolean}
 */
function verifyBumpSignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string') return false;

  const signature = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;

  // Validate length and alphabet before decoding: Buffer.from(x, 'hex')
  // silently drops invalid characters.
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Bump.sh webhook endpoint. express.raw with '*/*' keeps the exact bytes for
// any content type, which is what the signature covers.
app.post(
  '/webhooks/bump-sh',
  express.raw({ type: '*/*', limit: '5mb' }),
  (req, res) => {
    const secret = process.env.BUMP_SH_WEBHOOK_SECRET;
    if (!secret) {
      console.error('BUMP_SH_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    // No body parsed (e.g. empty request) => verify against zero bytes.
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    if (!verifyBumpSignature(rawBody, req.get('x-bump-signature-256'), secret)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after the signature is verified.
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (!isObject(payload)) {
      return res.status(400).send('Unexpected payload');
    }

    // Bump.sh has a single notification (a documentation structure change) with
    // body { api, diff } and no event-name field. Check types before reading in.
    const api = isObject(payload.api) ? payload.api : null;
    const diff = isObject(payload.diff) ? payload.diff : null;

    console.log('Bump.sh documentation structure change received', {
      apiKeys: api ? Object.keys(api) : null,
      diffKeys: diff ? Object.keys(diff) : null,
    });
    // TODO: post to chat, open a ticket, regenerate SDKs, notify API consumers, etc.

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyBumpSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bump-sh`);
  });
}
