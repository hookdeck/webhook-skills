// Generated with: mailparser-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * MAILPARSER WEBHOOK AUTHENTICATION
 *
 * Mailparser does NOT sign webhooks: its docs describe no signature header,
 * HMAC or timestamp. An Advanced Webhook instead has an "Additional Headers"
 * field (one `Name: value` per line) that is sent unchanged on every request:
 *
 *   X-Webhook-Secret: <random value>
 *   Authorization: Basic <base64(user:pass)>
 *
 * Compare the WHOLE value against the one you configured, in constant time.
 */

/** Header name to check. Node lowercases incoming header names. */
function headerName(env = process.env) {
  return (env.MAILPARSER_WEBHOOK_HEADER || 'x-webhook-secret').trim().toLowerCase();
}

/**
 * Constant-time compare of the received header value.
 *
 * @param {string|undefined} received  The header value Mailparser sent
 * @param {string|undefined} expected  MAILPARSER_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyMailparserHeader(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(String(received), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** No event ID exists, so hash the raw body as a fallback idempotency key. */
function bodyHash(rawBody) {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Mailparser webhook endpoint.
 *
 * Nothing is signed over the body, but express.raw() keeps the order
 * "authenticate, then parse" and lets us return a clean 400 on bad JSON.
 */
app.post('/webhooks/mailparser', express.raw({ type: '*/*' }), (req, res) => {
  const expected = process.env.MAILPARSER_WEBHOOK_SECRET;

  // Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
  if (!expected) {
    console.error('MAILPARSER_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }

  const name = headerName();
  const received = req.headers[name];
  if (!received) {
    return res.status(401).json({ error: `Missing ${name} header` });
  }

  if (!verifyMailparserHeader(received, expected)) {
    console.error(`Mailparser webhook ${name} header mismatch`);
    return res.status(401).json({ error: `Invalid ${name} header` });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  console.log(`✓ Authenticated Mailparser webhook (${bodyHash(raw).slice(0, 12)})`);

  handleParsedEmail(payload);

  res.status(200).json({ received: true });
});

/**
 * Mailparser has no event types: the body is the parsed data you defined in
 * the HTTP Body Payload Template, so field names are your parsing-rule names.
 */
function handleParsedEmail(payload) {
  // TODO: check bodyHash (or a unique parsed field) against your store and return if seen.
  const fields = Object.keys(payload);
  console.log(`📧 Parsed email data with ${fields.length} field(s): ${fields.join(', ')}`);
}

module.exports = { app, headerName, verifyMailparserHeader, bodyHash };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mailparser webhook server listening on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/mailparser`);
  });
}
