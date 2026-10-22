// Generated with: braze-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Braze lets the marketer pick the HTTP method, so accept all of these.
const ALLOWED_METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Parse "Authorization: Basic base64(username:password)". Scheme is case-insensitive. */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':'); // split on the FIRST colon: passwords may contain ':'
  if (i < 0) return null;
  return { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

/**
 * Braze does not sign webhooks. A Basic authentication credential saved in
 * Settings > Credential Management supplies the Authorization header. This checks it.
 * Both fields are compared before deciding (no short-circuit).
 */
function verifyBrazeRequest(
  headers,
  username = process.env.BRAZE_WEBHOOK_USERNAME,
  password = process.env.BRAZE_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}

/** The body is whatever the marketer composed: JSON, raw text (XML, form data) or nothing (GET). */
function parseBody(raw) {
  const text = raw.toString('utf8');
  if (text.trim() === '') return { kind: 'empty', body: null };
  try {
    return { kind: 'json', body: JSON.parse(text) };
  } catch {
    return { kind: 'text', body: text };
  }
}

function handleRequest(method, { kind, body }) {
  switch (kind) {
    case 'json':
      // Braze adds no event field. Illustrative body: {"message_body": "Your order just arrived!", "user_id": "u_123"}
      console.log(`Braze ${method} with JSON body:`, body);
      // TODO: act on the keys your campaign or Canvas step composes
      break;
    case 'text':
      console.log(`Braze ${method} with text body: ${body.slice(0, 200)}`);
      // TODO: parse the raw text format your message uses (XML, form data, ...)
      break;
    default:
      console.log(`Braze ${method} with no body`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.route('/webhooks/braze').all(express.raw({ type: '*/*' }), (req, res) => {
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyBrazeRequest(req.headers)) {
    res.set('WWW-Authenticate', 'Basic realm="braze-webhook"');
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0); // GET has no body
  const parsed = parseBody(raw);

  try {
    handleRequest(req.method, parsed);
  } catch (err) {
    console.error('Error handling Braze webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBrazeRequest = verifyBrazeRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: ${ALLOWED_METHODS.join('|')} http://localhost:${PORT}/webhooks/braze`);
  });
}
