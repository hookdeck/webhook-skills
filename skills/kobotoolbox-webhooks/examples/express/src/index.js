// Generated with: kobotoolbox-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison of two byte strings. Hashing both sides first gives
 * equal-length buffers, so timingSafeEqual never throws and length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is
 * case-insensitive and the credentials split on the FIRST colon (passwords may
 * contain colons). Returns null if the header is missing or malformed.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+=*)\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * KoboToolbox REST Services do not sign requests. They send HTTP Basic auth on
 * every request; a static credential, so it authenticates the sender, not the body.
 * Both comparisons run before deciding (no short-circuit).
 */
function verifyKoboRequest(
  headers,
  username = process.env.KOBOTOOLBOX_WEBHOOK_USERNAME,
  password = process.env.KOBOTOOLBOX_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}

/**
 * A REST Service fires once per new submission. There is no event type: the body
 * is the submission (JSON or XML, optionally a subset of fields or a custom wrapper).
 */
function handleSubmission(body, format) {
  if (format === 'json' && body && typeof body === 'object' && !Array.isArray(body)) {
    console.log(`New submission ${body._id} (${body._xform_id_string}) at ${body._submission_time}`);
    // TODO: store the submission; use body._uuid or body._id to deduplicate retries
  } else {
    console.log(`New submission (${format}, ${String(body).length} chars)`);
    // TODO: parse the XML submission (or your custom wrapper) with your XML library
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/kobotoolbox', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyKoboRequest(req.headers)) {
    res.set('WWW-Authenticate', 'Basic realm="kobotoolbox"');
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  // JSON when it parses as JSON; otherwise keep the raw text (XML format).
  let body = raw;
  let format = 'xml/text';
  try {
    body = JSON.parse(raw);
    format = 'json';
  } catch {
    /* not JSON: leave as raw text */
  }

  try {
    handleSubmission(body, format);
  } catch (err) {
    console.error('Error handling KoboToolbox submission:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyKoboRequest = verifyKoboRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/kobotoolbox`);
  });
}
