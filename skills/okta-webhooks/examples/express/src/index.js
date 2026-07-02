// Generated with: okta-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const express = require('express');
require('dotenv').config();

const app = express();

const OKTA_WEBHOOK_SECRET = process.env.OKTA_WEBHOOK_SECRET;

/**
 * Timing-safe comparison of the Authorization header against the shared secret.
 * Okta Event Hooks have no HMAC signature — auth is a static Authorization value.
 */
function isAuthorized(authHeader, secret) {
  const a = Buffer.from(authHeader || '', 'utf8');
  const b = Buffer.from(secret || '', 'utf8');
  // Length check first: crypto.timingSafeEqual throws on unequal-length buffers.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Dispatch on the System Log event type found at data.events[].eventType.
 */
function handleEvent(event) {
  switch (event.eventType) {
    case 'user.lifecycle.create':
      console.log('User created:', event.target?.[0]?.alternateId);
      // TODO: provision downstream account, send welcome flow, etc.
      break;
    case 'user.session.start':
      console.log('User signed in:', event.actor?.alternateId);
      // TODO: audit logging, anomaly detection, etc.
      break;
    case 'user.account.lock':
      console.log('Account locked:', event.target?.[0]?.alternateId);
      // TODO: security alerting, notify the user, etc.
      break;
    case 'group.user_membership.add':
      console.log('User added to group:', event.target?.map((t) => t.alternateId));
      // TODO: sync entitlements, update downstream roles, etc.
      break;
    default:
      console.log('Unhandled event type:', event.eventType);
  }
}

/**
 * One-time verification handshake.
 * Okta sends a GET with the x-okta-verification-challenge header; echo it back.
 */
app.get('/webhooks/okta', (req, res) => {
  const challenge = req.headers['x-okta-verification-challenge'];
  res.status(200).json({ verification: challenge });
});

/**
 * Event delivery. Okta POSTs a JSON payload with data.events[].
 * Parsed JSON is fine here because Okta does not sign the body.
 */
app.post('/webhooks/okta', express.json(), (req, res) => {
  if (!isAuthorized(req.headers['authorization'], OKTA_WEBHOOK_SECRET)) {
    return res.status(401).send('Unauthorized');
  }

  const events = req.body?.data?.events;
  if (!Array.isArray(events)) {
    return res.status(400).send('Invalid payload: missing data.events[]');
  }

  // Acknowledge quickly, then process. A single POST may carry multiple events.
  for (const event of events) {
    handleEvent(event);
  }

  res.status(200).json({ received: true });
});

// Only start the server when run directly (not when imported by tests).
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Okta webhook receiver listening on http://localhost:${port}/webhooks/okta`);
  });
}

module.exports = app;
