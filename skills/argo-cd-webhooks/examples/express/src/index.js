// Generated with: argo-cd-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

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
 * Argo CD does not sign webhooks. The notifications engine sends every header
 * configured on the webhook service, so authenticate with a header you add
 * (service.webhook.<name>.headers). The header name is yours to choose; the whole
 * header value is compared exactly (a "Bearer " prefix is not parsed or stripped).
 */
function verifyArgoCdRequest(
  headers,
  secret = process.env.ARGO_CD_WEBHOOK_SECRET,
  headerName = process.env.ARGO_CD_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// Illustrative payload: Argo CD has no event field. This body comes from the
// template in references/setup.md, whose "trigger" field is written by that template.
function handleNotification(payload) {
  const { trigger, app: appName, sync_status: syncStatus, health } = payload;

  switch (trigger) {
    case 'on-sync-succeeded':
      console.log(`Sync succeeded: ${appName} (sync ${syncStatus}, health ${health})`);
      // TODO: mark the deployment as successful
      break;

    case 'on-sync-failed':
      console.log(`Sync failed: ${appName} (sync ${syncStatus}, health ${health})`);
      // TODO: alert the team
      break;

    case 'on-health-degraded':
      console.log(`Health degraded: ${appName} (sync ${syncStatus}, health ${health})`);
      // TODO: open an incident
      break;

    default:
      console.log(`Unhandled notification: ${trigger}`);
  }
}

// Argo CD sends GET unless the template sets a method, so accept every method the
// template can choose (GET, POST, PUT, PATCH) plus DELETE. Read the body raw (any
// content type) and authenticate before parsing it.
async function argoCdHandler(req, res) {
  if (!verifyArgoCdRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Argo CD webhook credential' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  // An empty template body. Argo CD sends the body with GET (the default) too.
  if (raw.trim() === '') {
    console.log(`Argo CD ${req.method} request with an empty body`);
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleNotification(payload);
  } catch (err) {
    console.error('Error handling Argo CD notification:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  app[method]('/webhooks/argo-cd', express.raw({ type: '*/*' }), argoCdHandler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyArgoCdRequest = verifyArgoCdRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/argo-cd (GET, POST, PUT, PATCH, DELETE)`);
  });
}
