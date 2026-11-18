// Generated with: gusto-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Gusto (Embedded Payroll) signs event payloads with X-Gusto-Signature: the
// HMAC-SHA256 of the raw body, keyed with the subscription's
// verification_token. Gusto's current guide doesn't name the encoding; its
// own developer doc and Rails sample use a bare hex digest (no "sha256=").
//
// Setup handshake: after you create a webhook subscription, Gusto POSTs the
// verification_token to your URL. You can't verify that request (you don't
// have the token yet), so it's acknowledged without a signature check and
// nothing else happens. Call PUT /v1/webhook_subscriptions/{uuid}/verify
// with the token, then set GUSTO_VERIFICATION_TOKEN.
// ---------------------------------------------------------------------------

/**
 * Verify X-Gusto-Signature against the exact bytes Gusto sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Gusto-Signature
 * @param {string|undefined} token - GUSTO_VERIFICATION_TOKEN
 * @returns {boolean}
 */
function verifyGustoSignature(rawBody, signature, token) {
  const secret = String(token || '').trim();
  const value = String(signature || '').trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}

/**
 * The handshake request carries verification_token and no event_type.
 * Anything with an event_type is an event and must be signed.
 */
function verificationTokenFrom(rawBody) {
  try {
    const body = JSON.parse(rawBody.toString('utf8'));
    if (body && typeof body.verification_token === 'string' && body.event_type === undefined) {
      return body.verification_token;
    }
  } catch {
    // not JSON: not the handshake
  }
  return null;
}

/**
 * Events name the change and the UUIDs; fetch the entity from the API for
 * details. resource_type is always Company; entity_type is the resource that
 * changed. One API call can produce several events, in any order.
 */
function handleEvent(event) {
  switch (event.event_type) {
    case 'company.provisioned':
      // Always sent when a company connects your app, subscribed or not.
      console.log(`Company ${event.resource_uuid} connected`);
      break;
    case 'payroll.paid':
      console.log(`Payroll ${event.entity_uuid} paid for company ${event.resource_uuid}`);
      break;
    case 'payroll.processed':
    case 'payroll.processing_failed':
    case 'payroll.reversed':
      console.log(`${event.event_type}: payroll ${event.entity_uuid}`);
      break;
    case 'employee.created':
    case 'employee.updated':
    case 'employee.onboarded':
    case 'employee.terminated':
      console.log(`${event.event_type}: employee ${event.entity_uuid}`);
      break;
    default:
      console.log(`Unhandled Gusto event: ${event.event_type}`);
  }
  return { received: true, event_type: event.event_type, uuid: event.uuid };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/gusto', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const configured = process.env.GUSTO_VERIFICATION_TOKEN;

  const handshakeToken = verificationTokenFrom(rawBody);
  if (handshakeToken !== null) {
    if (!configured || !configured.trim()) {
      // One-time setup: you need this value to verify the subscription.
      console.log(
        `Gusto sent the subscription's verification_token: ${handshakeToken}\n` +
          'Call PUT /v1/webhook_subscriptions/{uuid}/verify with it, then set GUSTO_VERIFICATION_TOKEN.'
      );
    } else {
      console.log('Gusto re-sent the verification_token (not logged: it is your signing key)');
    }
    return res.status(200).json({ received: true, verification_token_received: true });
  }

  if (!configured || !configured.trim()) {
    console.error('GUSTO_VERIFICATION_TOKEN is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!verifyGustoSignature(rawBody, req.get('x-gusto-signature'), configured)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Answer with a 2xx within 10 seconds, or Gusto retries (up to 16 times over 3 days).
  return res.status(200).json(handleEvent(event));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Gusto webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/gusto`);
  });
}

module.exports = { app, verifyGustoSignature, verificationTokenFrom, handleEvent };
