// Generated with: leonardo-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)

/**
 * Leonardo.Ai does not sign payloads. If a webhook callback API key is set, every
 * callback carries "Authorization: Bearer <key>". The configured secret is the bare
 * key; a pasted "Bearer <key>" is tolerated (stripped) like Hookdeck does.
 * A static credential authenticates the sender, not the body, and has no replay protection.
 */
function verifyLeonardoRequest(headers, configured = process.env.LEONARDO_AI_WEBHOOK_SECRET) {
  if (!configured) return false; // never accept when unconfigured
  const secret = BEARER.test(configured) ? configured.slice(7) : configured;
  if (!secret) return false; // a configured value of just "Bearer " must not match
  const header = headers['authorization'] || '';
  if (!BEARER.test(header)) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  // timingSafeEqual throws on unequal lengths, so check them first.
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function handleEvent(payload) {
  switch (payload.type) {
    case 'image_generation.complete': {
      const generation = payload.data && payload.data.object;
      // Don't log the whole payload: the documented sample embeds the callback key.
      const images = (generation && generation.images) || [];
      console.log(`Generation ${generation && generation.id} ${generation && generation.status}: ${images.length} image(s)`);
      // TODO: download images[].url, update your job record, notify the user
      break;
    }

    default:
      console.log(`Unhandled event: ${payload.type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/leonardo-ai', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyLeonardoRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization Bearer key' });
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
    console.error('Error handling Leonardo.Ai event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyLeonardoRequest = verifyLeonardoRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/leonardo-ai`);
  });
}
