// Generated with: rocketreach-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a RocketReach webhook.
 *
 * X-RocketReach-Signature = base64(HMAC-SHA256(key = secret as UTF-8, message = raw body)).
 * No timestamp is signed.
 *
 * @param {Buffer|string} rawBody - RAW request body, never re-serialised JSON
 * @param {string|undefined} signatureHeader - X-RocketReach-Signature value
 * @param {string|undefined} secret - ROCKETREACH_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyRocketReachSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  // Compare the base64 strings as UTF-8 bytes: no lenient base64 decoding of the header
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);

  // timingSafeEqual throws on length mismatch, so compare lengths first
  return expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Read the body as raw bytes for ANY content type, so the signature can be verified
// before anything is parsed.
app.post('/webhooks/rocketreach', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ROCKETREACH_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never process unverified webhooks
    console.error('ROCKETREACH_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('x-rocketreach-signature');
  if (!signature) {
    return res.status(401).json({ error: 'Missing X-RocketReach-Signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  if (!verifyRocketReachSignature(rawBody, signature, secret)) {
    console.error('RocketReach signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // There are no event types. A People Lookup delivers one profile object and a Bulk
  // People Lookup delivers a list of them.
  const requestId = req.get('rr-request-id');
  const profiles = Array.isArray(payload) ? payload : [payload];

  for (const profile of profiles) {
    const list = profile.profile_list ? ` (list ${profile.profile_list.id})` : '';
    if (profile.status === 'complete') {
      console.log(`Lookup complete for profile ${profile.id}${list} [request ${requestId}]`);
    } else {
      console.log(`Lookup ${profile.status || 'update'} for profile ${profile.id}${list} [request ${requestId}]`);
    }
  }

  // Key idempotency on the RR-Request-ID header plus the profile id
  // (see references/overview.md).
  res.json({ received: true, profiles: profiles.length });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`RocketReach webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/rocketreach`);
  });
}

module.exports = { app, verifyRocketReachSignature };
