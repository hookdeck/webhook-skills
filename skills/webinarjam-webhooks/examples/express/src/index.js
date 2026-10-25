// Generated with: webinarjam-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * WebinarJam does not sign requests. The only authentication is the header you add on the
 * Custom Webhook integration: the Bearer token option sends `Authorization: Bearer <token>`,
 * the Custom header option sends the name and value you chose. The header name is user-chosen,
 * so it comes from WEBINARJAM_WEBHOOK_HEADER (default Authorization), and the WHOLE value
 * (including any "Bearer " prefix) is compared with WEBINARJAM_WEBHOOK_SECRET. Don't strip or
 * parse the prefix.
 */
function verifyWebinarJamRequest(headers, config = process.env) {
  const expected = config.WEBINARJAM_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured
  const name = (config.WEBINARJAM_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name]; // Node lower-cases incoming header names
  if (typeof received !== 'string' || !received) return false;
  return safeEqual(received, expected);
}

function handleEvent(payload) {
  // WebinarJam documents no event field: add `event` as a custom body key-value pair
  // (or use a different URL path per automation rule) to tell triggers apart.
  switch (payload.event) {
    case 'registered':
      console.log(`Registered: ${payload.email}`);
      // TODO: add the lead to your CRM and send the live room link
      break;

    case 'attended_live':
      console.log(`Attended live: ${payload.email}`);
      // TODO: tag the lead as an attendee
      break;

    case 'missed_live':
      console.log(`Missed live: ${payload.email}`);
      // TODO: send the replay link
      break;

    case 'left_early':
      console.log(`Left early: ${payload.email}`);
      // TODO: follow up with the replay
      break;

    case 'purchased':
      console.log(`Purchased: ${payload.email}`);
      // TODO: mark the lead as a customer
      break;

    default:
      console.log(`Unhandled WebinarJam trigger "${payload.event}": ${payload.email}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type WebinarJam uses.
app.post('/webhooks/webinarjam', express.raw({ type: '*/*' }), (req, res) => {
  if (!process.env.WEBINARJAM_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }
  if (!verifyWebinarJamRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling WebinarJam webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyWebinarJamRequest = verifyWebinarJamRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/webinarjam`);
  });
}
