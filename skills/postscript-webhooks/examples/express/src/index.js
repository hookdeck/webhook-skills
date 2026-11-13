// Generated with: postscript-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Postscript does not sign payloads. The Postscript-Signature header carries the
 * account's webhook signing token (from GET /api/v2/webhooks/token) as plain text,
 * so the whole header value is compared with the stored token. This authenticates
 * the sender, not the body, and gives no replay protection: use HTTPS and keep
 * the token secret (the docs call it fixed and document no rotation).
 */
function verifyPostscriptRequest(headers, token = process.env.POSTSCRIPT_WEBHOOK_TOKEN) {
  if (!token) return false; // never accept when unconfigured
  const received = headers['postscript-signature'];
  if (!received) return false;
  const a = Buffer.from(String(received));
  const b = Buffer.from(token);
  // timingSafeEqual throws on unequal lengths, so check them first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function handleEvent(payload) {
  const { event, event_data: data = {} } = payload;

  switch (event) {
    case 'shop.incoming_message':
      console.log(`Incoming message ${data.id} from subscriber ${data.subscriber_id}`);
      // Route to support or reply via the Send Message API
      break;

    case 'shop.subscriber.opt_in':
      console.log(`Subscriber opted in for ${payload.resource_id}`);
      // Sync the consent change to your CRM (event_data is undocumented for this event)
      break;

    case 'shop.subscriber.opt_out':
      console.log(`Subscriber opted out for ${payload.resource_id}`);
      // Suppress the subscriber in other channels (event_data is undocumented for this event)
      break;

    case 'shop.email_collected':
      console.log(`Email collected for ${payload.resource_id}`);
      // Add the email to your list (event_data is undocumented for this event)
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/postscript', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPostscriptRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Postscript-Signature' });
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
    console.error('Error handling Postscript event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPostscriptRequest = verifyPostscriptRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/postscript`);
  });
}
