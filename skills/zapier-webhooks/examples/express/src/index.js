// Generated with: zapier-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// Receiver for the "Webhooks by Zapier" action (POST / PUT / Custom Request).
//
// Zapier does NOT sign these requests: there is no signature header, no HMAC
// and no signing secret. You authenticate them with a secret you put into the
// Zap yourself, using one of the two places the action offers:
//
//   - Headers section:  X-Webhook-Secret | <ZAPIER_WEBHOOK_SECRET>
//   - Basic Auth field: <username>|<password>  (sent as Authorization: Basic ...)
//
// Both are compared in constant time. The payload is whatever you defined in
// the action's Data section (Form or JSON, or raw text for XML / Raw / Custom
// Request), so there is no fixed schema and no Zapier event type.

const SECRET_HEADER = 'x-webhook-secret';

// Read config per request so tests (and secret rotation) don't need a restart.
function config() {
  return {
    secret: process.env.ZAPIER_WEBHOOK_SECRET || '',
    username: process.env.ZAPIER_BASIC_AUTH_USERNAME || '',
    password: process.env.ZAPIER_BASIC_AUTH_PASSWORD || '',
  };
}

// Constant-time string compare. Hashing both sides first gives equal-length
// buffers, so timingSafeEqual never throws and the length isn't leaked.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifySecretHeader(headerValue, secret) {
  return Boolean(secret) && safeEqual(headerValue, secret);
}

function verifyBasicAuth(authorizationHeader, username, password) {
  if (!username || !password || typeof authorizationHeader !== 'string') return false;
  const match = authorizationHeader.match(/^Basic\s+(.+)$/i);
  if (!match) return false;
  const decoded = Buffer.from(match[1].trim(), 'base64').toString('utf8');
  return safeEqual(decoded, `${username}:${password}`);
}

/**
 * Authenticate a Zapier request.
 * @returns {boolean|null} null when no method is configured (caller fails closed)
 */
function verifyZapierRequest(headers, cfg = config()) {
  const headerConfigured = Boolean(cfg.secret);
  const basicConfigured = Boolean(cfg.username && cfg.password);
  if (!headerConfigured && !basicConfigured) return null;

  // Accept whichever configured method the Zap uses.
  return (
    (headerConfigured && verifySecretHeader(headers[SECRET_HEADER], cfg.secret)) ||
    (basicConfigured && verifyBasicAuth(headers.authorization, cfg.username, cfg.password))
  );
}

function requireZapierAuth(req, res, next) {
  const result = verifyZapierRequest(req.headers);
  if (result === null) {
    console.error('Zapier webhook refused: no ZAPIER_WEBHOOK_SECRET or Basic Auth credentials set');
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }
  if (!result) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
  }
  return next();
}

// Payload Type in the Zap decides the Content-Type: JSON, Form (URL-encoded),
// or XML / Raw / Custom Request text, which is returned as-is.
function parseBody(rawBody, contentType) {
  if (contentType.includes('application/json')) return JSON.parse(rawBody);
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }
  return rawBody;
}

/**
 * Handle one Zap action run. The fields are the keys you entered in the
 * action's Data section (or every field from the previous step if Data was
 * left blank). If several Zaps share this endpoint, add a field such as
 * `event` in Data and dispatch on it.
 */
function handleZapAction(payload) {
  const event = payload && typeof payload === 'object' && typeof payload.event === 'string'
    ? payload.event
    : 'zap action';

  switch (event) {
    // case 'lead.created':  // a value YOU chose in the Zap's Data section
    //   createLead(payload);
    //   break;
    default:
      console.log(`Zapier ${event}:`, payload);
  }
  return event;
}

const app = express();

// The action's POST and PUT events, and Custom Request (any of these methods), all land here.
const zapierHandler = [
  // Authenticate before parsing anything.
  requireZapierAuth,
  // Read every Payload Type as raw bytes, then parse by Content-Type.
  express.raw({ type: '*/*' }),
  (req, res) => {
    let payload;
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      payload = parseBody(rawBody, req.get('content-type') || '');
    } catch {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const event = handleZapAction(payload);
    // Zapier marks the action step as errored on a non-2xx response.
    res.status(200).json({ received: true, event });
  },
];
app.post('/webhooks/zapier', zapierHandler);
app.put('/webhooks/zapier', zapierHandler);
app.patch('/webhooks/zapier', zapierHandler);
app.delete('/webhooks/zapier', zapierHandler);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = { app, verifyZapierRequest, verifySecretHeader, verifyBasicAuth, safeEqual, parseBody };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zapier`);
  });
}
