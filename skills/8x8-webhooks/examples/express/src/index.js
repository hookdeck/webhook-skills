// Generated with: 8x8-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * 8x8 does not sign payloads. The only authentication is the optional HTTP Authorization
 * value you set on the webhook, sent back as the Authorization header (for example
 * "Bearer 9QQhlsEb8VY" or "Basic dXNlcjpwYXNzd29yZA=="). Compare the WHOLE header value,
 * scheme prefix included. Never strip the prefix or base64-decode a Basic value.
 */
function verify8x8Request(headers, config = process.env) {
  const expected = config.EIGHT_X_EIGHT_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(event) {
  const p = event.payload || {};

  switch (event.eventType) {
    case 'inbound_message_received':
      console.log(`Inbound message ${p.umid} from ${p.source || (p.user && p.user.msisdn)}`);
      // TODO: route the reply to your conversation or support system
      break;

    case 'outbound_message_status_changed':
      console.log(`Message ${p.umid}: ${p.status && p.status.state}`);
      // TODO: update delivery status (queued, sent, delivered, undelivered, rejected, read)
      break;

    case 'external_app_message':
      console.log(`WhatsApp Business App message ${p.umid}`);
      break;

    case 'short_url_clicked':
      console.log(`Short URL clicked: ${p.shortUrl} -> ${p.targetUrl}`);
      // TODO: record the click against the original SMS (p.umid)
      break;

    case 'template_status_update':
      console.log(`Template ${event.eventDetails && event.eventDetails.templateName} status update`);
      // TODO: sync template approval status
      break;

    case 'template_category_update':
    case 'template_quality_update':
    case 'template_correct_category_detection':
    case 'phone_number_quality_update':
    case 'account_update':
    case 'whatsapp_automatic_events':
      console.log(`WhatsApp business update: ${event.eventType}`);
      break;

    default:
      console.log(`Unhandled 8x8 event: ${event.eventType}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type 8x8 uses.
app.post('/webhooks/8x8', express.raw({ type: '*/*' }), (req, res) => {
  if (!verify8x8Request(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling 8x8 webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verify8x8Request = verify8x8Request;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/8x8`);
  });
}
