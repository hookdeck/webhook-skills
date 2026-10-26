// Generated with: reditus-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Reditus's docs don't name the HTTP method, so accept every method a sender might use.
const METHODS = new Set(['POST', 'PUT', 'PATCH', 'GET', 'DELETE']);

/**
 * Verify the X-Signature header: lowercase hex HMAC-SHA256 of the raw body bytes, keyed
 * with the webhook secret's UTF-8 bytes. Nothing else is signed (no timestamp, no id).
 */
function verifyReditusSignature(rawBody, signature, secret = process.env.REDITUS_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  // Validate length and alphabet before decoding (Buffer.from(..., 'hex') silently drops bad characters).
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // case-insensitive, as Hookdeck does
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Parsed fields are untrusted: only log values of the expected type.
const str = (v) => (typeof v === 'string' ? v : undefined);

function handleEvent(payload) {
  const eventType = str(payload.event_type);
  const data = isObject(payload.data) ? payload.data : {};

  switch (eventType) {
    case 'partnership.accepted':
      console.log(`Partnership accepted: ${str(data.affiliate_email)}`);
      // TODO: activate the affiliate in your system
      break;

    case 'referral.created':
      console.log(`Referral created: ${str(data.referral_id)} (affiliate ${str(data.affiliate_email)})`);
      // TODO: record the referral
      break;

    case 'advocate.created':
      console.log(`Advocate created: ${str(data.advocate_id)} (${str(data.advocate_email)})`);
      // TODO: send the advocate their referral link
      break;

    case 'lead.created':
      console.log(`Lead created: ${str(data.lead_id)} for advocate ${str(data.advocate_uid)}`);
      // TODO: attribute the lead to the advocate
      break;

    case 'reward.created': {
      // The docs' sample shows amount 5521 as $55.21, i.e. minor units.
      const amount = typeof data.amount === 'number' ? data.amount : undefined;
      console.log(`Reward created: ${str(data.reward_id)} amount=${amount} ${str(data.currency)}`);
      // TODO: grant the reward
      break;
    }

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body as raw bytes (any content type) so the exact bytes are verified; parse after.
app.all('/webhooks/reditus', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.has(req.method)) {
    res.set('Allow', [...METHODS].join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // A request with no body (e.g. GET) is verified over zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyReditusSignature(rawBody, req.headers['x-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing X-Signature' });
  }

  if (rawBody.length === 0) {
    console.log(`${req.method} webhook with empty body`);
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!isObject(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Reditus webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyReditusSignature = verifyReditusSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/reditus`);
  });
}
