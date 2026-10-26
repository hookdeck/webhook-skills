// Generated with: videoask-webhooks skill
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
 * VideoAsk does not sign payloads. Authenticate with a header you add in the Connect
 * tab ("Add a secret": header name and value) or through the API
 * (PUT /forms/{form_id}/webhooks/{tag}, "headers" object). The header name is
 * yours; the value is compared whole (no Bearer parsing). This authenticates the
 * sender only: no body integrity and no replay protection, so use HTTPS.
 */
function verifyVideoAskRequest(headers, options = {}) {
  const {
    headerName = process.env.VIDEOASK_WEBHOOK_HEADER || 'secret',
    secret = process.env.VIDEOASK_WEBHOOK_SECRET,
  } = options;
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { event_type: eventType, contact } = payload;
  const who = contact && (contact.email || contact.contact_id);

  switch (eventType) {
    case 'form_response':
      console.log(`Response received from ${who}`);
      // TODO: store payload.contact.answers
      break;

    case 'form_response_transcribed':
      console.log(`Response transcribed for ${who}`);
      // TODO: store transcripts from payload.contact.answers[].transcription
      break;

    case 'form_author_message':
      console.log(`Author message sent to ${who}`);
      // TODO: log payload.contact.messages
      break;

    case 'form_contact_message':
      console.log(`Contact message from ${who}`);
      // TODO: notify the team
      break;

    // Tag events are listed in VideoAsk's help centre; their payload isn't shown in the docs.
    case 'form_contact_tagged':
      console.log(`Tag added to contact ${who}`);
      // TODO: sync the contact's tags
      break;

    case 'form_contact_untagged':
      console.log(`Tag removed from contact ${who}`);
      // TODO: sync the contact's tags
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/videoask', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyVideoAskRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
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
    console.error('Error handling VideoAsk event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyVideoAskRequest = verifyVideoAskRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/videoask`);
  });
}
