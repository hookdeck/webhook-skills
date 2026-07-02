// Generated with: auth0-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

const AUTH0_LOG_STREAM_TOKEN = process.env.AUTH0_LOG_STREAM_TOKEN;

/**
 * Auth0 Custom Log Streams are not signed. Authenticate the request by
 * timing-safe comparing the incoming Authorization header against the token
 * you configured on the log stream.
 */
function verifyAuth0Token(headerValue, expectedToken) {
  if (!headerValue || !expectedToken) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expectedToken);
  // timingSafeEqual throws on unequal lengths — guard first.
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Process a single Auth0 log record. The event type code is at data.type.
 */
function handleEvent(event) {
  const data = event.data || event;
  const type = data.type;

  switch (type) {
    case 's':
      console.log(`Success login: ${data.user_name || data.user_id}`);
      // TODO: update last-login, send "new login" notification, etc.
      break;

    case 'f':
      console.log(`Failed login from ${data.ip}: ${data.description}`);
      // TODO: fraud/brute-force detection, alerting, etc.
      break;

    case 'ss':
      console.log(`Success signup: ${data.user_name || data.user_id}`);
      // TODO: provision the user, send welcome email, CRM sync, etc.
      break;

    case 'fs':
      console.log(`Failed signup: ${data.description}`);
      // TODO: debug registration flow, alerting, etc.
      break;

    case 'sepft':
      console.log(`Token exchange (password grant) for ${data.user_name || data.user_id}`);
      // TODO: token issuance auditing, etc.
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

// Auth0 posts a JSON array of log records. Parsing JSON is fine here because
// verification uses the Authorization header, not a body signature.
app.post('/webhooks/auth0', express.json(), (req, res) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).send('Missing Authorization header');
  }

  if (!verifyAuth0Token(authHeader, AUTH0_LOG_STREAM_TOKEN)) {
    return res.status(401).send('Invalid Authorization token');
  }

  // Auth0 batches events — the body is an array (be defensive about a single object).
  const events = Array.isArray(req.body) ? req.body : [req.body];

  // Acknowledge fast; Auth0 retries on any non-2xx response.
  res.status(200).json({ received: events.length });

  // Process after responding so slow work never causes a retry.
  for (const event of events) {
    try {
      handleEvent(event);
    } catch (err) {
      console.error('Error handling event:', err);
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/auth0`);
  });
}
