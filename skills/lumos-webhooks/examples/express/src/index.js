// Generated with: lumos-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison of two strings. timingSafeEqual throws on unequal
 * lengths, so check the lengths first (this only leaks the secret's length).
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Lumos requests are authenticated with a custom header you add to the webhook
 * in Lumos. The header name is yours to choose (LUMOS_WEBHOOK_HEADER, default
 * Authorization) and the WHOLE value is compared with LUMOS_WEBHOOK_SECRET.
 * No "Bearer " prefix is stripped or parsed.
 *
 * NOTE: Lumos also signs requests (HMAC-SHA256 in X-Lumos-Webhook-Signature), but
 * the header format is documented in a login-gated article, so it is NOT verified here.
 */
function verifyLumosRequest(
  headers,
  headerName = process.env.LUMOS_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.LUMOS_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

// Lumos does not publish field names, so the payload shape is illustrative.
// Provisioning and Deprovisioning bodies carry the user, the account on the target
// application, the application, the permissions, a comment and optional custom fields.
function handleWebhook(payload) {
  const email = payload.user && payload.user.email;
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
  console.log(`Lumos webhook for ${email || 'unknown user'}: ${permissions.length} permission(s)`);
  // TODO: grant or remove the listed permissions on your system, then return 200
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/lumos', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyLumosRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Lumos webhook header' });
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
    handleWebhook(payload);
  } catch (err) {
    console.error('Error handling Lumos webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyLumosRequest = verifyLumosRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/lumos`);
  });
}
