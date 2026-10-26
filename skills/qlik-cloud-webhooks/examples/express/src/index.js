// Generated with: qlik-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Qlik Cloud's docs don't name the HTTP method, so accept all the usual ones.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Verify the qlik-signature header: the lowercase hex HMAC-SHA256 of the raw request
 * body bytes, keyed with the webhook secret's UTF-8 bytes. No prefix, no timestamp.
 *
 * @param {Buffer} rawBody exact bytes received (empty Buffer when there is no body)
 * @param {string|undefined} signature the whole qlik-signature header value
 * @param {string|undefined} secret the secret set on the Qlik Cloud webhook
 */
function verifyQlikSignature(rawBody, signature, secret = process.env.QLIK_CLOUD_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false; // never accept when unconfigured
  // Validate the format first: exactly 64 hex characters (hex is case-insensitive).
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature.toLowerCase(), 'utf8'); // not Buffer.from(sig, 'hex')
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asString = (v) => (typeof v === 'string' ? v : undefined);

function handleEvent(payload) {
  // After verification every field is still untrusted: check types before reading.
  // `type` is the CloudEvents type. Payloads from before the hybrid period (and the
  // legacy fields until December 10, 2026) carry the same value in `eventType`.
  const type = asString(payload.type) ?? asString(payload.eventType);
  const data = isObject(payload.data) ? payload.data : {};
  const attributes = isObject(data.attributes) ? data.attributes : {};
  const id = asString(data.id) ?? asString(data.appId) ?? asString(attributes.id);

  switch (type) {
    case 'com.qlik.v1.app.created':
      console.log('App created:', id);
      // TODO: register the new app in your catalog
      break;

    case 'com.qlik.v1.app.published':
      console.log('App published:', id);
      // TODO: refresh whatever depends on the published app
      break;

    case 'com.qlik.v1.app.deleted':
      console.log('App deleted:', id);
      // TODO: remove the app from your catalog
      break;

    case 'com.qlik.v1.app.reload.finished':
    case 'com.qlik.v1.reload.finished':
      console.log('Reload finished:', id, data.succeeded === true ? 'succeeded' : 'not reported as succeeded');
      // TODO: kick off downstream work if the reload succeeded, alert if it did not
      break;

    case 'com.qlik.v1.user.created':
      console.log('User created:', id);
      // TODO: provision the user in your own system
      break;

    case 'com.qlik.v1.user.deleted':
      console.log('User deleted:', id);
      // TODO: deprovision the user
      break;

    case 'com.qlik.v1.automation.created':
      console.log('Automation created:', id);
      // TODO: track the new automation
      break;

    case 'com.qlik.v1.automation.run.started':
      console.log('Automation run started:', id);
      // TODO: record the run
      break;

    case 'com.qlik.v1.api-key.validation.failed':
      console.log('API key validation failed');
      // TODO: alert the tenant admin
      break;

    default:
      console.log(`Unhandled Qlik Cloud event: ${type}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified, then parse.
app.all('/webhooks/qlik-cloud', express.raw({ type: '*/*' }), (req, res) => {
  if (!process.env.QLIK_CLOUD_WEBHOOK_SECRET) {
    console.error('Set QLIK_CLOUD_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // GET and DELETE (and some PUT/PATCH) carry no body: verify them over zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Signature first, for every method.
  if (!verifyQlikSignature(rawBody, req.get('qlik-signature'))) {
    return res.status(401).json({ error: 'Invalid or missing qlik-signature' });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (rawBody.length === 0) {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!isObject(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Qlik Cloud event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyQlikSignature = verifyQlikSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/qlik-cloud`);
  });
}
