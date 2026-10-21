// Generated with: brevo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Authenticate a Brevo webhook request.
 *
 * Brevo does NOT sign webhook payloads (no HMAC/signature header). Instead the
 * webhook is created with one of:
 *   - Basic auth: credentials in the notify URL (https://user:pass@host/...),
 *     which Brevo sends as `Authorization: Basic base64(user:pass)`
 *   - Bearer token: `"auth": {"type": "bearer", "token": "..."}` on the
 *     webhook, sent as `Authorization: Bearer <token>`
 * Either configured method is accepted; credentials are compared timing-safe.
 *
 * @param {string|undefined} authHeader - Authorization header value
 * @param {{username?: string, password?: string, token?: string}} creds
 * @returns {boolean}
 */
function verifyBrevoAuth(authHeader, { username, password, token } = {}) {
  if (!authHeader) return false;

  if (token && authHeader.startsWith('Bearer ')) {
    return safeEqual(authHeader.slice(7), token);
  }

  if (username && password && authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const i = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
    if (i === -1) return false;
    // Evaluate both comparisons so timing doesn't reveal which one failed
    const userOk = safeEqual(decoded.slice(0, i), username);
    const passOk = safeEqual(decoded.slice(i + 1), password);
    return userOk && passOk;
  }

  return false;
}

function brevoCredentials() {
  return {
    username: process.env.BREVO_WEBHOOK_USERNAME,
    password: process.env.BREVO_WEBHOOK_PASSWORD,
    token: process.env.BREVO_WEBHOOK_TOKEN,
  };
}

function handleBrevoEvent(event) {
  // `event` is the payload value (snake_case), not the camelCase name you
  // subscribe with (e.g. subscribe to `hardBounce`, receive `hard_bounce`).
  switch (event.event) {
    case 'request': // "Sent" (transactional)
      console.log(`Sent to ${event.email} (${event['message-id']})`);
      break;
    case 'delivered':
      console.log(`Delivered to ${event.email}`);
      // TODO: Mark message as delivered
      break;
    case 'opened':
    case 'unique_opened':
    case 'proxy_open':
    case 'unique_proxy_open':
      console.log(`${event.event} by ${event.email}`);
      // TODO: Track engagement (proxy_open = opened via a privacy proxy, e.g. Apple MPP)
      break;
    case 'click':
      console.log(`Click by ${event.email}: ${event.link || event.URL}`);
      break;
    case 'hard_bounce':
    case 'invalid_email':
    case 'blocked':
      console.log(`${event.event} for ${event.email}: ${event.reason || ''}`);
      // TODO: Suppress the address
      break;
    case 'soft_bounce':
    case 'deferred':
    case 'error':
      console.log(`${event.event} for ${event.email}: ${event.reason || ''}`);
      break;
    case 'spam':
      console.log(`Spam complaint from ${event.email}`);
      // TODO: Unsubscribe / suppress the address
      break;
    case 'unsubscribed': // transactional
    case 'unsubscribe': // marketing
      console.log(`Unsubscribed: ${event.email}`);
      // TODO: Update subscription preferences
      break;
    case 'list_addition':
    case 'contact_updated':
    case 'contact_deleted':
      console.log(`Contact event ${event.event}: ${event.email}`);
      // TODO: Sync contact to your system
      break;
    default:
      console.log(`Unhandled Brevo event: ${event.event ?? event.msg_status ?? 'unknown'}`);
  }
}

// Accept any content type and parse JSON ourselves (no body signature to protect)
app.post('/webhooks/brevo', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const creds = brevoCredentials();
  const hasBasic = creds.username && creds.password;

  // Fail closed: without a configured credential there is nothing to check.
  if (!hasBasic && !creds.token) {
    console.error('Set BREVO_WEBHOOK_USERNAME/PASSWORD or BREVO_WEBHOOK_TOKEN');
    return res.status(500).send('Webhook authentication not configured');
  }

  if (!verifyBrevoAuth(req.headers.authorization, creds)) {
    console.error('Brevo webhook authentication failed');
    return res.status(401).send('Unauthorized');
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Batched webhooks (`batched: true`) deliver an array; normal ones a single object
  const events = Array.isArray(body) ? body : [body];
  if (events.some((e) => !e || typeof e !== 'object')) {
    return res.status(400).send('Invalid payload');
  }

  for (const event of events) {
    handleBrevoEvent(event);
  }

  // Respond 2xx quickly; Brevo may retry on 5xx responses
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, verifyBrevoAuth };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/brevo`);
  });
}
