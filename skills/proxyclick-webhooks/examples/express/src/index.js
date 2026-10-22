// Generated with: proxyclick-webhooks skill
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
 * Parse `Authorization: Basic base64(username:password)`. The scheme is
 * case-insensitive and the credentials split on the FIRST colon, so the password
 * may itself contain colons. Returns null for anything malformed.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2}) *$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/**
 * Proxyclick does not sign payloads. The only security option is HTTP Basic auth,
 * which must arrive on the FIRST request (no 401 + WWW-Authenticate challenge).
 * Both comparisons run before the result is combined, so a wrong username is not
 * distinguishable by timing from a wrong password.
 */
function verifyProxyclickRequest(headers, config = process.env) {
  const expectedUser = config.PROXYCLICK_WEBHOOK_USERNAME;
  const expectedPass = config.PROXYCLICK_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPass) return false; // never accept when unconfigured

  const creds = parseBasicAuth(headers['authorization']);
  if (!creds) return false;

  const userOk = safeEqual(creds.username, expectedUser);
  const passOk = safeEqual(creds.password, expectedPass);
  return userOk && passOk;
}

/**
 * ILLUSTRATIVE handler. Proxyclick's documented attribute reference was not
 * reachable when this skill was written and no event-type field is documented,
 * so nothing here dispatches on a field. Check a real delivery in your Hookdeck
 * or Proxyclick logs before relying on any key.
 */
function handleEvent(payload) {
  console.log(`Proxyclick webhook received (top-level keys: ${Object.keys(payload).join(', ')})`);
  // TODO: act on the visit or visitor data (check-in, check-out, visit created/updated/deleted)
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Proxyclick uses.
app.post('/webhooks/proxyclick', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyProxyclickRequest(req.headers)) {
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
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Proxyclick webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyProxyclickRequest = verifyProxyclickRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/proxyclick`);
  });
}
