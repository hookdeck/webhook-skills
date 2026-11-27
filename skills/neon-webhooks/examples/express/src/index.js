// Generated with: neon-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('node:crypto');
const express = require('express');

const app = express();

const JWKS_URL = `${process.env.NEON_AUTH_URL}/.well-known/jwks.json`;
const TOLERANCE_MS = 5 * 60 * 1000; // reject webhooks older than 5 minutes

// Cache public keys by `kid` so we don't fetch the JWKS on every request.
const jwksCache = new Map();

async function getPublicKey(kid) {
  if (jwksCache.has(kid)) return jwksCache.get(kid);

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
  const jwks = await res.json();

  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error(`Key ${kid} not found in JWKS`);

  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  jwksCache.set(kid, key);
  return key;
}

/**
 * Verify a Neon Auth webhook (EdDSA / Ed25519 detached JWS).
 * Returns the parsed JSON body, or throws on any verification failure.
 */
async function verifyNeonWebhook(rawBody, headers) {
  const signature = headers['x-neon-signature'];
  const kid = headers['x-neon-signature-kid'];
  const timestamp = headers['x-neon-timestamp'];

  if (!signature || !kid || !timestamp) {
    throw new Error('Missing Neon signature headers');
  }

  // X-Neon-Signature is a detached JWS: "header..signature" (empty middle section).
  const [headerB64, emptyPayload, signatureB64] = signature.split('.');
  if (emptyPayload !== '') {
    throw new Error('Expected detached JWS (header..signature)');
  }

  const publicKey = await getPublicKey(kid);

  // Reconstruct the signing input with DOUBLE base64url encoding.
  // A naive `${timestamp}.${body}` reconstruction will always fail.
  const payloadB64 = Buffer.from(rawBody, 'utf8').toString('base64url');
  const inner = `${timestamp}.${payloadB64}`; // X-Neon-Timestamp is in MILLISECONDS
  const signingInput = `${headerB64}.${Buffer.from(inner, 'utf8').toString('base64url')}`;

  // `null` algorithm tells Node to use the key's native algorithm (Ed25519).
  const isValid = crypto.verify(
    null,
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(signatureB64, 'base64url')
  );
  if (!isValid) throw new Error('Invalid signature');

  // Replay protection: reject stale timestamps.
  if (Date.now() - parseInt(timestamp, 10) > TOLERANCE_MS) {
    throw new Error('Timestamp too old');
  }

  return JSON.parse(rawBody); // parse only AFTER verifying
}

// Neon webhook endpoint - must use the raw body for signature verification.
app.post(
  '/webhooks/neon',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    let event;
    try {
      event = await verifyNeonWebhook(req.body, req.headers);
    } catch (err) {
      console.error('Webhook verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Idempotency: dedupe on X-Neon-Event-Id before doing real work.
    const eventId = req.headers['x-neon-event-id'];
    const eventType = req.headers['x-neon-event-type'];

    // Handle the event based on type. Blocking events (send.otp, send.magic_link,
    // user.before_create) pause the auth flow until this responds, so keep them fast.
    switch (eventType) {
      case 'send.otp':
        console.log('Send OTP (blocking):', eventId);
        // Your code: deliver event.event_data.otp_code via your own SMS/email provider.
        break;

      case 'send.magic_link':
        console.log('Send magic link (blocking):', eventId);
        // Your code: deliver event.event_data.link_url via your own channel.
        break;

      case 'user.before_create': {
        console.log('User before create (blocking):', eventId);
        // Neon reads this response: a 2xx with a JSON `allowed` field. Any other
        // response, or a failed delivery, rejects the signup.
        // Your code: decide whether to allow the signup, for example:
        // return res.json({ allowed: false, error_message: 'Signups from this domain are not allowed.', error_code: 'DOMAIN_BLOCKED' });
        return res.json({ allowed: true });
      }

      case 'user.created':
        console.log('User created:', eventId);
        // Your code: sync the user to your database, CRM, analytics, etc.
        break;

      case 'phone_number.verified':
        console.log('Phone number verified:', eventId);
        // Your code: unlock features, update profile state, etc.
        break;

      case 'organization.invitation.created':
        console.log('Organization invitation created:', eventId);
        // Your code: send a custom invitation email to event.event_data.invitee_email.
        break;

      case 'organization.invitation.accepted':
        console.log('Organization invitation accepted:', eventId);
        // Your code: provision resources for the new member.
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Return 2xx to acknowledge receipt. Neon ignores the body for these events.
    res.json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = app;
module.exports.verifyNeonWebhook = verifyNeonWebhook;
module.exports.jwksCache = jwksCache;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/neon`);
  });
}
