// Generated with: aimfox-webhooks skill
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
 * Aimfox does not sign payloads. The only authentication is the "Authentication Header"
 * you add to the webhook: a user-chosen header name (AIMFOX_WEBHOOK_HEADER, default
 * Authorization) whose whole value (AIMFOX_WEBHOOK_SECRET, including any "Bearer " or
 * "Basic " prefix) is compared as-is. This authenticates the sender, not the body, and
 * gives no replay protection.
 */
function verifyAimfoxRequest(headers, secret = process.env.AIMFOX_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const name = (process.env.AIMFOX_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name]; // Node lowercases incoming header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { event_type: type, id } = payload;

  switch (type) {
    case 'account_logged_in':
      console.log(`Account logged in (${id})`);
      // TODO: mark the account active (payload.event.account)
      break;

    case 'account_logged_out':
      console.log(`Account logged out (${id})`);
      // TODO: alert someone to re-authenticate (payload.event.account)
      break;

    case 'new_connection':
      console.log(`New connection (${id})`);
      // TODO: create a CRM contact
      break;

    case 'view':
      console.log(`Profile viewed (${id})`);
      break;

    case 'connect':
      console.log(`Connection request sent (${id})`);
      break;

    case 'accepted':
      console.log(`Connection request accepted (${id})`);
      // TODO: start a follow-up sequence
      break;

    case 'inmail':
      console.log(`InMail sent (${id})`);
      break;

    case 'message':
      console.log(`Message sent (${id})`);
      break;

    case 'new_reply':
      console.log(`New reply (${id})`);
      // TODO: notify sales
      break;

    case 'reply':
      console.log(`First campaign reply (${id})`);
      break;

    case 'inmail_reply':
      console.log(`InMail reply (${id})`);
      break;

    case 'lead_label_added':
      console.log(`Lead label added (${id})`);
      // TODO: sync the label to your CRM
      break;

    case 'campaign_created':
      console.log(`Campaign created (${id})`);
      break;

    case 'campaign_started':
      console.log(`Campaign started (${id})`);
      break;

    case 'campaign_ended':
      console.log(`Campaign ended (${id})`);
      break;

    case 'inbox_event':
      console.log(`Inbox event (${id})`);
      break;

    case 'campaign_reply':
      console.log(`Campaign reply (${id})`);
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/aimfox', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyAimfoxRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Aimfox authentication header' });
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
    console.error('Error handling Aimfox event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAimfoxRequest = verifyAimfoxRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/aimfox`);
  });
}
