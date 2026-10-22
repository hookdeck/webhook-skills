// Generated with: apify-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on buffers of different lengths.
 */
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Apify does not sign payloads. Authenticate with a secret header added through the
 * webhook's Headers template. The header name is user-chosen (APIFY_WEBHOOK_HEADER) and
 * the whole value is compared as-is (APIFY_WEBHOOK_SECRET), including any "Bearer " prefix.
 *
 * This authenticates the sender, not the body, and gives no replay protection.
 */
function verifyApifyRequest(headers, secret = process.env.APIFY_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const name = (process.env.APIFY_WEBHOOK_HEADER || 'X-Webhook-Secret').toLowerCase();
  const received = headers[name]; // Node lowercases incoming header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { eventType, eventData = {} } = payload;

  switch (eventType) {
    case 'ACTOR.RUN.CREATED':
      console.log(`Run created: ${eventData.actorRunId}`);
      break;

    case 'ACTOR.RUN.SUCCEEDED':
      console.log(`Run succeeded: ${eventData.actorRunId}`);
      // TODO: fetch results from /v2/actor-runs/{actorRunId}/dataset/items
      break;

    case 'ACTOR.RUN.FAILED':
      console.log(`Run failed: ${eventData.actorRunId}`);
      // TODO: alert or open a ticket
      break;

    case 'ACTOR.RUN.ABORTED':
      console.log(`Run aborted: ${eventData.actorRunId}`);
      break;

    case 'ACTOR.RUN.TIMED_OUT':
      console.log(`Run timed out: ${eventData.actorRunId}`);
      // TODO: alert or retry with a longer timeout
      break;

    case 'ACTOR.RUN.RESURRECTED':
      console.log(`Run resurrected: ${eventData.actorRunId}`);
      break;

    case 'ACTOR.BUILD.CREATED':
      console.log(`Build created: ${eventData.actorBuildId}`);
      break;

    case 'ACTOR.BUILD.SUCCEEDED':
      console.log(`Build succeeded: ${eventData.actorBuildId}`);
      break;

    case 'ACTOR.BUILD.FAILED':
      console.log(`Build failed: ${eventData.actorBuildId}`);
      // TODO: alert the Actor owner
      break;

    case 'ACTOR.BUILD.ABORTED':
      console.log(`Build aborted: ${eventData.actorBuildId}`);
      break;

    case 'ACTOR.BUILD.TIMED_OUT':
      console.log(`Build timed out: ${eventData.actorBuildId}`);
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/apify', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyApifyRequest(req.headers)) {
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
    console.error('Error handling Apify event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyApifyRequest = verifyApifyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/apify`);
  });
}
