// Generated with: jumpcloud-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is
 * case-insensitive and the value splits on the FIRST colon (passwords may
 * contain colons). Returns null if the header is missing or malformed.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * JumpCloud webhook channels are not signed. With Basic Authentication selected,
 * every request carries the channel's username and password. Compare both in
 * constant time and evaluate both before deciding (no short-circuit).
 */
function verifyJumpCloudRequest(
  headers,
  username = process.env.JUMPCLOUD_WEBHOOK_USERNAME,
  password = process.env.JUMPCLOUD_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}

// JumpCloud documents the field names but no example body or category values.
function handleAlert(alert) {
  const { alert_id, alert_title, priority, status, category, di_event } = alert;
  console.log(
    `JumpCloud alert ${alert_id} "${alert_title}" [${priority}/${status}] ` +
      `category=${category} di_event=${di_event}`
  );
  // TODO: open or update a ticket keyed on alert_id; route on priority and status
}

// Read the body raw (any content type) and authenticate before parsing it.
app.post('/webhooks/jumpcloud', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyJumpCloudRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
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
    handleAlert(payload);
  } catch (err) {
    console.error('Error handling JumpCloud alert:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyJumpCloudRequest = verifyJumpCloudRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/jumpcloud`);
  });
}
