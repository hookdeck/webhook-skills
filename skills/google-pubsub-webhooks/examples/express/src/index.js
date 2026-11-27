// Generated with: google-pubsub-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');

const app = express();

// One client for the process: it fetches Google's public signing keys once and
// caches them, honouring the endpoint's Cache-Control max-age.
const authClient = new OAuth2Client();

// Both forms are valid Google issuers and the official libraries accept either,
// so accept both rather than pinning one and rejecting a legitimate token.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Status codes Pub/Sub treats as an acknowledgement: 102, 200, 201, 202, 204.
// Anything else (including a timeout) is a nack and the message is redelivered.
const ACK_STATUS = 204;

function timingSafeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the OIDC token Pub/Sub attaches to an authenticated push subscription.
 *
 * There is NO signing secret and NO HMAC header — the `Authorization: Bearer`
 * JWT proves the CALLER (your push service account), not the body contents.
 * That is also why this handler does not need the raw body.
 *
 * @returns the token claims, or null if verification failed.
 */
async function verifyPushJwt(authorizationHeader, { audience, serviceAccountEmail }) {
  // RFC 9110 makes the auth scheme case-insensitive, so match it that way.
  const [scheme, token] = String(authorizationHeader || '').split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;

  let claims;
  try {
    // Verifies the RS256 signature against Google's public keys, plus aud + exp.
    const ticket = await authClient.verifyIdToken({ idToken: token.trim(), audience });
    claims = ticket.getPayload();
  } catch (err) {
    console.error('Pub/Sub OIDC verification failed:', err.message);
    return null;
  }

  // Checks the library does NOT do for you. Without the email check, any
  // Google-signed token with the right audience would be accepted.
  if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) return null;
  if (claims.email_verified !== true) return null;

  // Service account emails are case-insensitive: compare normalized so a casing
  // typo in config does not silently reject every message.
  const tokenEmail = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  if (!tokenEmail || tokenEmail !== serviceAccountEmail.trim().toLowerCase()) return null;

  return claims;
}

/**
 * Authenticate a push request. Fails closed: if the endpoint is configured with
 * neither OIDC nor a URL token, requests are rejected unless
 * PUBSUB_ALLOW_UNAUTHENTICATED is explicitly set (for the Pub/Sub emulator,
 * which sends no Authorization header at all).
 */
async function authenticate(req) {
  const audience = process.env.PUBSUB_AUDIENCE;
  const serviceAccountEmail = process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
  const verificationToken = process.env.PUBSUB_VERIFICATION_TOKEN;
  const allowUnauthenticated = process.env.PUBSUB_ALLOW_UNAUTHENTICATED === 'true';

  // Optional shared token embedded in the push endpoint URL (?token=...).
  // A shared-secret convention (Google uses the same env var in its App Engine
  // sample), not a signature scheme — see references/verification.md.
  if (verificationToken && !timingSafeCompare(req.query.token || '', verificationToken)) {
    return { ok: false, status: 401, error: 'Invalid verification token' };
  }

  if (serviceAccountEmail && audience) {
    const claims = await verifyPushJwt(req.get('authorization'), {
      audience,
      serviceAccountEmail,
    });
    if (!claims) return { ok: false, status: 401, error: 'Invalid OIDC token' };
    return { ok: true, claims };
  }

  if (verificationToken || allowUnauthenticated) {
    return { ok: true, claims: null };
  }

  // Misconfiguration, not a bad request: refuse rather than accept anything.
  console.error(
    'Set PUBSUB_AUDIENCE + PUBSUB_SERVICE_ACCOUNT_EMAIL, PUBSUB_VERIFICATION_TOKEN, ' +
      'or PUBSUB_ALLOW_UNAUTHENTICATED=true.'
  );
  return {
    ok: false,
    status: 500,
    error: 'Endpoint is not configured to authenticate Pub/Sub push requests',
  };
}

/** `message.data` is base64 and MAY be absent (attribute-only messages). */
function decodeData(data) {
  if (data === undefined || data === null) return null;
  const text = Buffer.from(data, 'base64').toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text; // Pub/Sub payloads are arbitrary bytes, not necessarily JSON.
  }
}

// Pub/Sub sends Content-Type: application/json. Unlike HMAC webhooks there is
// no body signature, so the standard JSON parser is fine here.
app.post('/webhooks/google-pubsub', express.json({ limit: '10mb' }), async (req, res) => {
  const auth = await authenticate(req);
  if (!auth.ok) return res.status(auth.status).send(auth.error);

  const { message, subscription } = req.body || {};
  if (!message || typeof message !== 'object' || !message.messageId) {
    return res.status(400).send('Invalid Pub/Sub push envelope');
  }

  // Optional allowlist: reject envelopes from a subscription we don't expect.
  const allowedSubscription = process.env.PUBSUB_SUBSCRIPTION;
  if (allowedSubscription && subscription !== allowedSubscription) {
    console.warn('Rejected push from unexpected subscription:', subscription);
    return res.status(403).send('Untrusted subscription');
  }

  const attributes = message.attributes || {};
  const payload = decodeData(message.data);

  // Delivery is at-least-once: de-duplicate on messageId, which is stable
  // across redeliveries of the same message.
  console.log('Pub/Sub message received:', message.messageId);
  console.log('Published at:', message.publishTime);
  // Your code: if (await alreadyProcessed(message.messageId)) return res.sendStatus(ACK_STATUS);

  // Pub/Sub defines no event catalog — any "event type" is whatever your
  // publisher put in `attributes`. Change the key to match your publisher.
  const eventType = attributes.eventType;
  if (eventType) {
    console.log('Event type attribute:', eventType);
    // Your code: route on your publisher's own attribute values.
  } else if (payload === null) {
    console.log('Attribute-only message (no data):', attributes);
  } else {
    console.log('Payload:', payload);
  }

  // Ack fast. The default ack deadline is 10s; do slow work asynchronously or
  // Pub/Sub redelivers the message.
  res.sendStatus(ACK_STATUS);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// express.json() rejects malformed bodies before the handler runs.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).send('Invalid JSON body');
  }
  return next(err);
});

// Export for testing
module.exports = { app, authClient };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/google-pubsub`);
  });
}
