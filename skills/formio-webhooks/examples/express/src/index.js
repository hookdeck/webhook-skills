// Generated with: formio-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

/** SHA-256 both sides so the buffers are always equal length for timingSafeEqual. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is case-insensitive
 * and the credentials are split on the FIRST colon (passwords may contain colons).
 * Returns { username, password } as Buffers, or null if missing or malformed.
 */
function parseBasicAuth(header) {
  const match = /^basic +([A-Za-z0-9+/]+={0,2}) *$/i.exec(header || '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * Form.io does not sign webhooks. The Webhook action's Authorize User / Authorize Password
 * fields are sent as HTTP Basic auth. A static credential authenticates the sender only: it
 * says nothing about the body and gives no replay protection.
 */
function verifyFormioRequest(
  headers,
  username = process.env.FORMIO_WEBHOOK_USERNAME,
  password = process.env.FORMIO_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}

// With the default "Match" request method, Form.io mirrors the operation that triggered the
// action: POST = create, PUT = update, DELETE = delete. There is no event field.
const OPERATIONS = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
  GET: 'read',
};

function handleSubmission(operation, payload, query) {
  // payload: { request, response, submission, params }. DELETE and GET may have no body.
  const submission = payload.submission || {};

  switch (operation) {
    case 'create':
      console.log(`Submission created: ${submission._id}`);
      // TODO: create the matching record in your system (submission.data)
      break;

    case 'update':
      console.log(`Submission updated: ${submission._id}`);
      // TODO: update the matching record
      break;

    case 'delete':
      console.log(`Submission deleted: ${submission._id || query.submissionId || '(see params)'}`);
      // TODO: delete the matching record
      break;

    default:
      console.log(`Unhandled ${operation} request`);
  }
}

// Read the body raw (any content type) and authenticate before parsing it.
app.all('/webhooks/formio', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.includes(req.method)) {
    res.set('Allow', METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyFormioRequest(req.headers)) {
    res.set('WWW-Authenticate', 'Basic realm="formio-webhook"');
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  // GET and some DELETE requests have an empty body.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = {};
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Expected a JSON object' });
    }
  }

  const operation = OPERATIONS[req.method];
  try {
    handleSubmission(operation, payload, req.query);
  } catch (err) {
    console.error('Error handling Form.io webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true, operation });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFormioRequest = verifyFormioRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST/PUT/PATCH/GET/DELETE http://localhost:${PORT}/webhooks/formio`);
  });
}
