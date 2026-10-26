// Generated with: hightouch-webhooks skill
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
 * Hightouch does not sign requests. The HTTP Request destination sends the header you
 * configured (name is your choice), so authenticate by comparing that header's WHOLE value
 * with HIGHTOUCH_WEBHOOK_SECRET. Do not strip or parse a "Bearer " prefix: the secret is
 * whatever exact value you typed. Node lowercases header names, so the lookup is
 * case-insensitive.
 *
 * A static shared credential authenticates the sender, not the body, and gives no replay
 * protection. Use HTTPS and rotate the credential if it leaks.
 */
function verifyHightouchRequest(
  headers,
  secret = process.env.HIGHTOUCH_WEBHOOK_SECRET,
  headerName = process.env.HIGHTOUCH_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

// Each sync trigger (rows added / changed / removed) picks its own method and payload,
// and the trigger is not written into the request. A common convention maps the method
// back to the trigger; adjust it to match how you configured the sync.
const TRIGGERS = {
  POST: 'row_added',
  PUT: 'row_changed',
  PATCH: 'row_changed',
  DELETE: 'row_removed',
};

function handleRequest(method, payload) {
  // With batching enabled the body is an array of rows (or an object wrapping one).
  const trigger = TRIGGERS[method] || 'unmapped';

  switch (trigger) {
    case 'row_added':
      console.log('Rows added:', JSON.stringify(payload));
      // TODO: create the record(s) in your system
      break;

    case 'row_changed':
      console.log('Rows changed:', JSON.stringify(payload));
      // TODO: update the record(s)
      break;

    case 'row_removed':
      console.log('Rows removed:', JSON.stringify(payload));
      // TODO: delete the record(s)
      break;

    default:
      console.log(`Unmapped ${method} request:`, JSON.stringify(payload));
  }

  return trigger;
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/hightouch', express.raw({ type: '*/*' }), (req, res) => {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).set('Allow', 'GET, POST, PUT, PATCH, DELETE').json({ error: 'Method not allowed' });
  }

  if (!verifyHightouchRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credential header' });
  }

  // Body may legitimately be empty (e.g. GET, or an empty-body sync).
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  try {
    const trigger = handleRequest(req.method, payload);
    res.status(200).json({ received: true, trigger });
  } catch (err) {
    console.error('Error handling Hightouch request:', err);
    res.status(500).json({ error: 'Handler error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHightouchRequest = verifyHightouchRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/hightouch (POST, PUT, PATCH, DELETE, GET)`);
  });
}
