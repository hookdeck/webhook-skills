// Generated with: webiny-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Webiny 6 signs webhooks with Standard Webhooks headers:
//   webhook-id         message ID (the background task ID, stable across retries)
//   webhook-timestamp  Unix seconds
//   webhook-signature  one or more space-separated "v1,<base64 HMAC-SHA256>"
// Signed content: `${id}.${timestamp}.${rawBody}`
// Key: the admin-entered secret's raw UTF-8 bytes. Only a secret that already
// starts with `whsec_` is treated as Standard Webhooks base64.
//
// Do NOT use the standardwebhooks or svix libraries here: they base64-decode
// the secret, so a free-text Webiny secret would produce the wrong key.
// ---------------------------------------------------------------------------

/** Resolve the HMAC key from the secret as entered in Webiny. Null = unusable. */
function resolveKey(secret) {
  if (!secret) return null;
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  return key.length > 0 ? key : null; // an empty key is never accepted
}

/** Read the webhook-* headers; fall back to svix-* when webhook-id is absent. */
function readSignatureHeaders(headers) {
  const prefix = headers['webhook-id'] ? 'webhook' : 'svix';
  return {
    id: headers[`${prefix}-id`],
    timestamp: headers[`${prefix}-timestamp`],
    signature: headers[`${prefix}-signature`],
  };
}

/**
 * Verify a Webiny delivery.
 * @param {Buffer} rawBody - the exact bytes Webiny sent
 * @param {object} headers - lower-cased request headers
 * @param {string} secret - the signing secret as entered in Webiny
 * @param {number} [toleranceSeconds] - optional max age of webhook-timestamp
 * @returns {{valid: boolean, error?: string}}
 */
function verifyWebinyWebhook(rawBody, headers, secret, toleranceSeconds = 0) {
  const key = resolveKey(secret);
  if (!key) return { valid: false, error: 'Signing secret missing or empty' };

  const { id, timestamp, signature } = readSignatureHeaders(headers);
  if (!id || !timestamp || !signature) return { valid: false, error: 'Missing signature headers' };
  if (!/^[1-9][0-9]*$/.test(timestamp)) return { valid: false, error: 'Invalid timestamp' };

  if (toleranceSeconds > 0) {
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > toleranceSeconds) return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), rawBody]))
    .digest();

  // Accept any v1 entry that matches; ignore other versions (v1a, ...).
  const ok = signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const received = Buffer.from(value, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
  return ok ? { valid: true } : { valid: false, error: 'Signature mismatch' };
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Retries reuse the same webhook-id.
const processedMessageIds = new Set();

// Event names are registered at runtime by the installed Webiny apps and shown
// in the admin, so the handler dispatches on the envelope's `event` string.
// Envelope: {id, event, timestamp, webhookId, deliveryId, tenant, data}
function handleEvent(envelope) {
  const { event, tenant, webhookId, deliveryId, data } = envelope;
  console.log(`Webiny event "${event}" (tenant ${tenant}, webhook ${webhookId}, delivery ${deliveryId})`);

  switch (event) {
    // Add cases for the events you subscribed to in the Webiny admin, e.g.
    // an entry-published event from the headless CMS.
    default:
      console.log('Event data:', JSON.stringify(data));
  }
}

// express.raw() with '*/*' keeps the exact bytes whatever the content type;
// express.json() would re-serialise the body and break the signature.
app.post('/webhooks/webiny', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.WEBINY_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('WEBINY_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = parseInt(process.env.WEBINY_WEBHOOK_TOLERANCE_SECONDS || '0', 10) || 0;
  const result = verifyWebinyWebhook(rawBody, req.headers, secret, tolerance);
  if (!result.valid) {
    console.error('Webiny webhook verification failed:', result.error);
    return res.status(400).json({ error: result.error });
  }

  let envelope;
  try {
    envelope = JSON.parse(rawBody.toString('utf8')); // parse only after verifying
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const messageId = readSignatureHeaders(req.headers).id;
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(envelope);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Webiny event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Webiny webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/webiny`);
  });
}

module.exports = { app, server, verifyWebinyWebhook, resolveKey };
