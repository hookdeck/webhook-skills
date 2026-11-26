// Generated with: auth0-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

// The token you set as the event stream's bearer authorization.
const AUTH0_EVENT_STREAM_TOKEN = process.env.AUTH0_EVENT_STREAM_TOKEN;

/**
 * Auth0 Event Streams are not signed. With bearer authorization, Auth0 sends
 * `Authorization: Bearer <token>` on every request, so compare the whole
 * header with a timing-safe check.
 */
function verifyAuth0Authorization(headerValue, token) {
  if (!headerValue || !token) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(`Bearer ${token}`);
  // timingSafeEqual throws on unequal lengths, so guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Handle one Auth0 event. Each request carries a single CloudEvents-shaped
 * object: `type` says what happened and `data.object` holds the entity.
 */
function handleEvent(event) {
  const { id, type, time, data } = event;
  const object = (data && data.object) || {};

  switch (type) {
    case 'user.created':
      console.log(`User created: ${object.user_id} (event ${id} at ${time})`);
      // Your code: create the user in your database
      break;

    case 'user.updated':
      console.log(`User updated: ${object.user_id}`);
      // Your code: compare `time` with your stored copy before overwriting
      break;

    case 'user.deleted':
      console.log(`User deleted: ${object.user_id}`);
      // Your code: remove or deactivate the user
      break;

    case 'organization.member.added':
      console.log(`Organization member added: event ${id}`);
      // Your code: grant access in your system
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

// Parsing JSON is fine here: verification uses the Authorization header,
// not a signature over the raw body.
app.post('/webhooks/auth0', express.json(), (req, res) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  if (!verifyAuth0Authorization(authHeader, AUTH0_EVENT_STREAM_TOKEN)) {
    return res.status(401).json({ error: 'Invalid Authorization header' });
  }

  const event = req.body;

  // Acknowledge first: Auth0 retries only three times, 1s, 2s and 4s apart,
  // and a 4xx response fails the event with no retry.
  res.sendStatus(204);

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling event:', err);
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
