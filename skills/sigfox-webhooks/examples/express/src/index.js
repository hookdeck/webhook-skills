// Generated with: sigfox-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison. timingSafeEqual throws on unequal lengths, so check
 * lengths first (the length of a random credential isn't a useful secret).
 */
function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Sigfox callbacks are not signed. You add a secret header to the callback's Headers;
 * the header name is yours (SIGFOX_WEBHOOK_HEADER, default Authorization) and the
 * expected value is the exact whole header value (SIGFOX_WEBHOOK_SECRET), including
 * any "Bearer " prefix you typed. A static credential authenticates the sender, not
 * the body, and gives no replay protection.
 */
function verifySigfoxRequest(
  headers,
  secret = process.env.SIGFOX_WEBHOOK_SECRET,
  name = process.env.SIGFOX_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

/**
 * The callback type isn't in the request, so infer it from the variables present.
 */
function classifyCallback(p) {
  if ('severity' in p) return 'error';
  if ('infoCode' in p) return 'service acknowledge';
  if ('repeatedMsg' in p) return 'service repeater';
  if ('lqi' in p || 'linkQuality' in p) return 'data advanced';
  if ('ack' in p || 'longPolling' in p) return 'data bidir';
  if ('batt' in p || 'temp' in p) return 'service status';
  if ('data' in p) return 'data uplink';
  return 'unknown';
}

function handleCallback(payload) {
  const type = classifyCallback(payload);

  switch (type) {
    case 'data uplink':
      console.log(`Uplink from ${payload.device}: ${payload.data} (seq ${payload.seqNumber})`);
      // TODO: decode payload.data (hex) and store the reading
      break;

    case 'data bidir':
      console.log(`Bidir uplink from ${payload.device}, ack=${payload.ack}`);
      // TODO: respond with downlink data if payload.ack is true
      break;

    case 'data advanced':
      console.log(`Advanced data from ${payload.device}, link quality ${payload.lqi}`);
      // TODO: store link quality and duplicate metadata
      break;

    case 'service status':
      console.log(`Status from ${payload.device}: battery ${payload.batt} V, temp ${payload.temp}`);
      // TODO: update device health
      break;

    case 'service acknowledge':
      console.log(`Downlink ack for ${payload.device}: code ${payload.infoCode}`);
      // TODO: mark the downlink delivered or failed
      break;

    case 'service repeater':
      console.log(`Repeater ${payload.device}: ${payload.repeatedMsg} repeated messages`);
      // TODO: record repeater stats
      break;

    case 'error':
      console.log(`Error for ${payload.device}: ${payload.info} (${payload.severity})`);
      // TODO: alert that the device missed its keep-alive
      break;

    default:
      console.log('Unhandled Sigfox callback');
  }

  return type;
}

/**
 * Variables arrive in the query string (GET) and/or the body template (POST/PUT, JSON or
 * form-encoded). Throws on a body that can't be parsed into an object.
 */
function parsePayload(req) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let body = {};
  if (raw.trim() !== '') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    body = contentType.includes('application/x-www-form-urlencoded')
      ? Object.fromEntries(new URLSearchParams(raw))
      : JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Expected an object');
    }
  }
  return { ...req.query, ...body };
}

function sigfoxHandler(req, res) {
  // Authenticate before parsing anything.
  if (!verifySigfoxRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credential header' });
  }

  let payload;
  try {
    payload = parsePayload(req);
  } catch {
    return res.status(400).json({ error: 'Invalid body' });
  }

  try {
    const type = handleCallback(payload);
    return res.status(200).json({ received: true, type });
  } catch (err) {
    console.error('Error handling Sigfox callback:', err);
    return res.status(500).json({ error: 'Handler error' });
  }
}

// Read the body raw (any content type); the method is user-chosen, so accept GET, POST and PUT.
app
  .route('/webhooks/sigfox')
  .get(express.raw({ type: '*/*' }), sigfoxHandler)
  .post(express.raw({ type: '*/*' }), sigfoxHandler)
  .put(express.raw({ type: '*/*' }), sigfoxHandler)
  .all((req, res) => res.status(405).set('Allow', 'GET, POST, PUT').json({ error: 'Method not allowed' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySigfoxRequest = verifySigfoxRequest;
module.exports.classifyCallback = classifyCallback;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: GET/POST/PUT http://localhost:${PORT}/webhooks/sigfox`);
  });
}
