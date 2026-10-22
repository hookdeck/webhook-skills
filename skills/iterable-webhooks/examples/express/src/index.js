// Generated with: iterable-webhooks skill
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
 * Iterable does not sign payloads. The only authentication is the Authorization header,
 * set when you pick Basic or OAuth 2.0 on the system webhook:
 *   OAuth 2.0 -> "Bearer <token>"
 *   Basic     -> exactly the string you typed in Authentication Token (e.g. "Basic abc123")
 * Compare the WHOLE header value, scheme prefix included. Never strip the prefix and
 * never base64-decode a Basic value.
 */
function verifyIterableRequest(headers, config = process.env) {
  const expected = config.ITERABLE_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(payload) {
  const { eventName, email, dataFields = {} } = payload;

  switch (eventName) {
    case 'emailSend':
      console.log(`Email sent to ${email}: ${dataFields.emailSubject}`);
      // TODO: record the send against campaignId / messageId
      break;

    case 'emailOpen':
      console.log(`Email opened by ${email} (campaign ${dataFields.campaignId})`);
      // TODO: record the open (check dataFields.isBot / proxySource)
      break;

    case 'emailClick':
      console.log(`Email link clicked by ${email}: ${dataFields.url}`);
      // TODO: record the click
      break;

    case 'emailBounce':
      console.log(`Email bounced for ${email}: ${dataFields.recipientState}`);
      // TODO: suppress the address on HardBounce
      break;

    case 'emailComplaint':
      console.log(`Spam complaint from ${email}`);
      // TODO: suppress the address
      break;

    case 'emailUnSubscribe': // note the capital S: this is the exact name Iterable sends
      console.log(`Unsubscribe from ${email}: ${dataFields.unsubSource}`);
      // TODO: update the user's marketing preferences
      break;

    case 'smsSend':
      console.log(`SMS sent to ${email || payload.userId}`);
      break;

    case 'pushSend':
      console.log(`Push sent to ${email || payload.userId}`);
      break;

    case 'inAppOpen':
      console.log(`In-app message opened by ${email || payload.userId}`);
      break;

    default:
      console.log(`Unhandled Iterable event: ${eventName}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Iterable uses.
app.post('/webhooks/iterable', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyIterableRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
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
    console.error('Error handling Iterable webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyIterableRequest = verifyIterableRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/iterable`);
  });
}
