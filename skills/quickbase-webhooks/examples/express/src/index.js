// Generated with: quickbase-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Quickbase does not sign webhooks. You add a secret header in the webhook's Message header
 * list; the header name is yours (QUICKBASE_WEBHOOK_HEADER, default Authorization) and the
 * expected value is the exact, whole header value (QUICKBASE_WEBHOOK_SECRET), including any
 * "Bearer " prefix. Never strip or parse a prefix: compare the whole value.
 *
 * This authenticates the sender, not the body, and gives no replay protection.
 */
function verifyQuickbaseRequest(headers, secret = process.env.QUICKBASE_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const name = (process.env.QUICKBASE_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name]; // Node lowercases header names
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received, 'latin1'); // Node decodes header bytes as latin1
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Quickbase adds no event field. The `event` field below is ILLUSTRATIVE: it is a literal you
 * type into your message body template (one webhook per trigger), not something Quickbase sends.
 */
function handleEvent(payload) {
  switch (payload.event) {
    case 'record_added':
      console.log(`Record added: ${payload.record_id}`);
      // TODO: create the record in your system
      break;

    case 'record_modified':
      console.log(`Record modified: ${payload.record_id}`);
      // TODO: update the record in your system
      break;

    case 'record_deleted':
      console.log(`Record deleted: ${payload.record_id}`);
      // TODO: remove the record from your system
      break;

    default:
      console.log('Unrecognized Quickbase payload; acknowledging');
  }
}

/** Parse the body only after authentication. Accepts JSON, XML, RAW text or nothing. */
function parseBody(rawBody) {
  const text = rawBody.toString('utf8');
  if (!text.trim()) return null; // empty body (e.g. GET or DELETE)
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null; // XML or RAW: nothing to dispatch on
  }
}

const METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/quickbase', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  if (!METHODS.includes(req.method)) {
    res.set('Allow', METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyQuickbaseRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  try {
    const payload = parseBody(rawBody);
    if (payload) handleEvent(payload);
    else console.log(`Quickbase ${req.method} with ${rawBody.length} byte non-JSON/empty body`);
  } catch (err) {
    console.error('Error handling Quickbase webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyQuickbaseRequest = verifyQuickbaseRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/quickbase`);
  });
}
