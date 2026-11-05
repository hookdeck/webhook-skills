// Generated with: workspace-one-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Workspace ONE UEM does not sign event notifications. It sends the User Name and
 * Password from the Event Notifications rule as HTTP Basic auth:
 *   Authorization: Basic base64(username:password)
 * Omnissa's page doesn't say whether they arrive on the first request or only after
 * a 401 challenge, so check the headers of a test notification.
 */
function verifyWorkspaceOneRequest(
  headers,
  username = process.env.WORKSPACE_ONE_WEBHOOK_USERNAME,
  password = process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured

  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec((headers.authorization || '').trim());
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
  if (colon === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, colon), username);
  const passOk = safeEqual(decoded.slice(colon + 1), password);
  return userOk && passOk;
}

/**
 * Omnissa documents the event labels but no payload, so this reads no field from the
 * body. Store the raw body and Content-Type, then write your parser from real
 * notifications captured from your tenant.
 */
function storeNotification(rawBody, contentType) {
  console.log(`Workspace ONE notification: ${rawBody.length} bytes, ${contentType}`);
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/workspace-one', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyWorkspaceOneRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    storeNotification(rawBody, req.get('content-type'));
  } catch (err) {
    console.error('Error storing Workspace ONE notification:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyWorkspaceOneRequest = verifyWorkspaceOneRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/workspace-one`);
  });
}
