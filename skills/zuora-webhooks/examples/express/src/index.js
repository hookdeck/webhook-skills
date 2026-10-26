// Generated with: zuora-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// The callout HTTP method is set on the template (POST by default).
const ALLOWED_METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

/**
 * Constant-time comparison of two Buffers. Hashing both sides first gives
 * equal-length buffers, so timingSafeEqual never throws and length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)".
 * Scheme is case-insensitive; the credentials split on the FIRST colon, so the
 * password may contain colons. Returns { username, password } as Buffers, or null.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic') return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(parts[1])) return null;

  const decoded = Buffer.from(parts[1], 'base64');
  const colon = decoded.indexOf(0x3a); // ':'
  if (colon === -1) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * Zuora callouts are not signed. The template's Username/Password authentication
 * (with Enable Preemptive Authentication) sends HTTP Basic credentials on every request.
 * Both values are compared before deciding, so a wrong username and a wrong password
 * take the same time.
 */
function verifyZuoraRequest(
  headers,
  username = process.env.ZUORA_WEBHOOK_USERNAME,
  password = process.env.ZUORA_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;

  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}

/**
 * Zuora adds no event field: the body is whatever merge fields the callout template
 * defines. This handler assumes an illustrative JSON body such as
 * {"event": "PaymentProcessed", "accountId": "..."} that you write into the template.
 */
function handleCallout(payload) {
  const { event } = payload;

  switch (event) {
    case 'PaymentProcessed':
      console.log(`Payment processed for account ${payload.accountId}`);
      // TODO: mark the invoice paid, then fetch full details from the Zuora API
      break;

    case 'InvoicePosted':
      console.log(`Invoice posted for account ${payload.accountId}`);
      // TODO: email the invoice, then fetch full details from the Zuora API
      break;

    default:
      console.log(`Unhandled callout: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/zuora', express.raw({ type: '*/*' }), (req, res) => {
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyZuoraRequest(req.headers)) {
    res.set('WWW-Authenticate', 'Basic realm="zuora"');
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  // GET (and any empty body) carries its merge fields in the URL, if at all.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload;
  if (raw.trim() === '') {
    payload = { ...req.query };
  } else {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Expected a JSON object' });
    }
  }

  try {
    handleCallout(payload);
  } catch (err) {
    console.error('Error handling Zuora callout:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Zuora needs a 200; "success" satisfies the optional "Confirm success by parsing response content".
  res.status(200).json({ received: true, success: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyZuoraRequest = verifyZuoraRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/zuora (POST, PUT, PATCH, GET, DELETE)`);
  });
}
