// Generated with: kibana-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// The Kibana Webhook connector can use POST (default), PUT, PATCH, GET or DELETE.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Strict base64 alphabet with correct padding: valid credentials followed by junk are rejected.
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Kibana does not sign webhooks. With Basic authentication selected on the connector it sends
 * `Authorization: Basic base64(username:password)` on every request. Hookdeck never sends a 401
 * challenge, so the header must be present on each request.
 */
function verifyBasicAuth(authHeader, username, password) {
  if (!username || !password) return false; // never accept when unconfigured
  const m = /^basic\s+(\S+)$/i.exec(authHeader || ''); // scheme is case-insensitive
  if (!m || !STRICT_BASE64.test(m[1])) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // split on the first colon; the password may contain ':'
  if (sep === -1) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, sep), username);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

// Read the body raw so any content type works; parse only after the credential check.
app.all('/webhooks/kibana', express.raw({ type: '*/*' }), (req, res) => {
  // 1. Authenticate first, for every method
  const authorized = verifyBasicAuth(
    req.headers['authorization'],
    process.env.KIBANA_WEBHOOK_USERNAME,
    process.env.KIBANA_WEBHOOK_PASSWORD
  );
  if (!authorized) {
    console.error('Kibana webhook authentication failed');
    return res.status(401).send('Unauthorized');
  }

  // 2. Allow only the methods the connector can use
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).send('Method Not Allowed');
  }

  // 3. The body may be empty (GET, DELETE). Parse JSON when it parses, otherwise keep the raw text.
  const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = text;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  // 4. Handle the rule action. The body is whatever your connector's mustache template renders.
  // ILLUSTRATIVE payload (not a vendor schema):
  //   {"rule": "{{rule.name}}", "status": "{{alert.actionGroup}}", "context": "{{context.message}}"}
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (String(payload.status).toLowerCase() === 'recovered') {
      console.log(`Rule recovered: ${payload.rule}`);
      // TODO: resolve the incident, notify the channel
    } else {
      console.log(`Rule action fired: ${payload.rule} (${payload.status}): ${payload.context}`);
      // TODO: open an incident, page on-call
    }
  } else {
    console.log(`Received ${req.method} with ${text ? 'non-JSON' : 'empty'} body`);
  }

  // 5. Acknowledge quickly with any 2XX
  res.json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBasicAuth = verifyBasicAuth;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/kibana`);
  });
}
