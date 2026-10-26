// Generated with: workato-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// The request method is chosen in the Workato recipe, so accept all of these.
const METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

/**
 * Constant-time string comparison. Lengths are checked first (equal-length
 * buffers are required by timingSafeEqual), then the bytes are compared.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Workato has no webhook signature. The recipe's HTTP action uses an HTTP
 * connection with Basic auth, which sends:
 *   Authorization: Basic base64(username:password)
 * This is a static shared credential: it authenticates the sender, not the
 * body, and gives no replay protection.
 */
function verifyWorkatoRequest(headers, config = process.env) {
  const user = config.WORKATO_WEBHOOK_USERNAME;
  const password = config.WORKATO_WEBHOOK_PASSWORD;
  if (!user || !password) return false; // never accept when unconfigured

  const match = (headers['authorization'] || '').match(/^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i);
  if (!match) return false;

  const decoded = Buffer.from(match[1].trim(), 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // the password may itself contain ':'
  if (sep === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, sep), user);
  const passwordOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passwordOk;
}

/**
 * Workato has no built-in webhook events: the payload is whatever the recipe's
 * HTTP action sends. These examples assume { "event": "...", "data": {...} }.
 */
function handleEvent(payload) {
  const { event, data = {} } = payload;

  switch (event) {
    case 'order.created':
      console.log(`Order created: ${data.order_id}`);
      // TODO: fulfil the order
      break;

    case 'record.updated':
      console.log(`Record updated: ${data.record_id}`);
      // TODO: sync the record
      break;

    case 'recipe.failed':
      console.log(`Recipe failed: ${data.recipe_name} (${data.error})`);
      // TODO: alert the owning team
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated
// before anything is parsed.
app.all('/webhooks/workato', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.includes(req.method)) {
    return res.status(405).set('Allow', METHODS.join(', ')).json({ error: 'Method not allowed' });
  }

  if (!verifyWorkatoRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
  }

  // GET and DELETE usually have no body; that's fine.
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

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Workato request:', err);
    // A non-2xx fails the recipe step (and retries, if the step has retries on).
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyWorkatoRequest = verifyWorkatoRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Endpoint: ${METHODS.join('|')} http://localhost:${PORT}/webhooks/workato`);
  });
}
