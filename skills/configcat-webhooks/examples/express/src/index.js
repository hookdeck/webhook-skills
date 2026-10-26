// Generated with: configcat-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Standard base64 (padded) SHA-256 digest: 43 characters + "="
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

// ConfigCat signs: webhook ID + timestamp + raw body, concatenated with NO separators.
// The message is built as bytes: header values as latin1, body bytes exactly as received.
function computeSignature(secret, webhookId, timestamp, rawBody) {
  const message = Buffer.concat([
    Buffer.from(webhookId, 'latin1'),
    Buffer.from(timestamp, 'latin1'),
    rawBody,
  ]);
  // The key is the whole secret (including configcat_whsk_) as UTF-8 bytes
  return crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest('base64');
}

// Returns { valid: true } or { valid: false, error }
function verifyConfigCatWebhook({ rawBody, webhookId, timestamp, signature, secret, toleranceSeconds = 0, nowSeconds }) {
  if (!webhookId || !timestamp || !signature) {
    return { valid: false, error: 'Missing X-ConfigCat-Webhook-ID, -Timestamp or -Signature-V1 header' };
  }
  // The whole header is ONE digest. Two signing keys produce a comma-separated list and fail here.
  if (!SIGNATURE_PATTERN.test(signature)) {
    return { valid: false, error: 'Malformed signature' };
  }

  const expected = Buffer.from(computeSignature(secret, webhookId, timestamp, rawBody));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Opt-in replay window (off by default: Hookdeck retries and replays keep the original timestamp)
  if (toleranceSeconds > 0) {
    const sentAt = Number(timestamp);
    const now = nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }
  return { valid: true };
}

const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Raw body for any content type (and GET, which has no body): the signature covers exact bytes
app.all('/webhooks/configcat', express.raw({ type: '*/*' }), (req, res) => {
  if (!WEBHOOK_METHODS.includes(req.method)) {
    return res.status(405).send('Method not allowed');
  }

  const secret = process.env.CONFIGCAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CONFIGCAT_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyConfigCatWebhook({
    rawBody,
    webhookId: req.get('x-configcat-webhook-id'),
    timestamp: req.get('x-configcat-webhook-timestamp'),
    signature: req.get('x-configcat-webhook-signature-v1'),
    secret,
    toleranceSeconds: Number(process.env.CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS) || 0,
  });
  if (!result.valid) {
    console.error(`Webhook verification failed: ${result.error}`);
    return res.status(401).json({ error: result.error });
  }

  // ConfigCat has no event types: the body is whatever template the webhook author wrote
  // (optional), e.g. {"config":"##ConfigName##","environment":"##EnvironmentName##"}.
  // Parse only after verification: JSON if it parses, else text, or empty.
  const text = rawBody.toString('utf8');
  let body = text || null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // plain text body
  }

  const webhookId = req.get('x-configcat-webhook-id');
  console.log(`ConfigCat settings changed (${req.method}, webhook ${webhookId})`, body);
  // TODO: refresh your ConfigCat client, invalidate caches, notify your team
  // Don't dedupe on X-ConfigCat-Webhook-ID: it is different for every request, including
  // ConfigCat's retries (up to 5). Keep this idempotent, e.g. refresh state rather than apply deltas.

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`ConfigCat webhook server listening on port ${port}`);
  });
}

module.exports = { app, computeSignature, verifyConfigCatWebhook };
