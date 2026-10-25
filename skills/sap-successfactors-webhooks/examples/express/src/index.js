// Generated with: sap-successfactors-webhooks skill
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
 * Parse `Authorization: Basic base64(username:password)`.
 * The scheme is case-insensitive, the token must use only the strict base64
 * alphabet and decode canonically (so valid credentials followed by junk are
 * rejected), and the pair is split on the FIRST colon.
 * Returns { username, password } or null.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic +([^ ]+)$/i.exec(header);
  if (!match) return null;
  const token = match[1];
  if (token.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token)) return null;
  const decoded = Buffer.from(token, 'base64');
  if (decoded.toString('base64') !== token) return null; // non-canonical padding bits
  const text = decoded.toString('utf8');
  const idx = text.indexOf(':');
  if (idx < 0) return null;
  return { username: text.slice(0, idx), password: text.slice(idx + 1) };
}

/**
 * SAP SuccessFactors does not sign requests. The Integration Center REST connection
 * sends HTTP Basic credentials; this checks them against your configured pair.
 * Both comparisons run before the result is decided (no short-circuit).
 */
function verifySapSuccessFactorsRequest(
  headers,
  username = process.env.SAP_SUCCESSFACTORS_WEBHOOK_USERNAME,
  password = process.env.SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers['authorization']);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}

/**
 * The body is whatever the integration author mapped from the starting entity, in
 * the chosen payload format (JSON or XML). There is no vendor event field.
 * Parse JSON only when the content type says so; otherwise keep the raw text.
 * Returns { format, data } or throws on malformed JSON.
 */
function parseBody(raw, contentType = '') {
  if (!raw) return { format: 'empty', data: null };
  if (/(^|\/|\+)json\b/i.test(contentType)) return { format: 'json', data: JSON.parse(raw) };
  if (/xml/i.test(contentType)) return { format: 'xml', data: raw };
  return { format: 'text', data: raw };
}

function handleDelivery(method, { format, data }) {
  // Illustrative only: your mapped fields decide what arrives. Example JSON body:
  //   {"userId":"example-1001","firstName":"Ada","lastName":"Lovelace","department":"Engineering"}
  console.log(`SAP SuccessFactors ${method} delivery (${format})`);
  if (format === 'json') {
    // TODO: upsert the record(s) you mapped, e.g. data.userId
  } else if (format === 'xml') {
    // TODO: parse the XML with your preferred parser
  }
  // GET deliveries and empty requests ("no records") carry no body: nothing to process.
  return data;
}

// Read the body raw (any content type) so the request is authenticated before parsing.
const rawBody = express.raw({ type: '*/*' });

function webhook(req, res) {
  if (!verifySapSuccessFactorsRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  let parsed;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    parsed = parseBody(raw, req.headers['content-type']);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  try {
    handleDelivery(req.method, parsed);
  } catch (err) {
    console.error('Error handling SAP SuccessFactors delivery:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true, format: parsed.format });
}

// The sender picks GET or POST on the REST operation. POST is recommended.
app
  .route('/webhooks/sap-successfactors')
  .get(rawBody, webhook)
  .post(rawBody, webhook)
  .all((req, res) => res.status(405).set('Allow', 'GET, POST').json({ error: 'Method not allowed' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySapSuccessFactorsRequest = verifySapSuccessFactorsRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: GET/POST http://localhost:${PORT}/webhooks/sap-successfactors`);
  });
}
