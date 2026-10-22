// Generated with: cartesia-webhooks skill
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
 * Cartesia does not sign the payload. It sends the secret you set on the webhook,
 * raw with no prefix, in the x-webhook-secret header of every delivery.
 */
function verifyCartesiaRequest(headers, secret = process.env.CARTESIA_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept requests when unconfigured
  const received = headers['x-webhook-secret'];
  if (!received || Array.isArray(received)) return false;
  return safeEqual(received, secret);
}

// Cartesia retries a failed delivery, so the same event can arrive more than once.
// webhook_request_id is stable across retries. Use a shared store (Redis, DB) in production.
const processed = new Set();

function handleEvent(event) {
  switch (event.type) {
    case 'call_started':
      console.log(`Call started: ${event.call_id} (agent ${event.agent_id})`);
      // TODO: open a call record
      break;

    case 'call_completed':
      console.log(`Call completed: ${event.call_id} (${event.call?.end_reason})`);
      // TODO: store the transcript in event.call.transcript
      break;

    case 'call_failed':
      console.log(`Call failed: ${event.call_id} (${event.call?.error_message})`);
      // TODO: alert the owning team
      break;

    case 'call_turn':
      console.log(`Turn ${event.turn?.id} (${event.turn?.role}): ${event.turn?.text}`);
      // TODO: stream the turn to a live dashboard
      break;

    case 'post_call_analysis':
      console.log(`Call summary: ${event.analysis?.summary}`);
      // TODO: attach the summary to the call record
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// Read the body raw so any content type works and nothing is parsed before authentication.
app.post('/webhooks/cartesia', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyCartesiaRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-webhook-secret' });
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

  const requestId = event.webhook_request_id;
  if (requestId && processed.has(requestId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Cartesia event:', err);
    // 5xx is retried by Cartesia (up to 3 attempts).
    return res.status(500).json({ error: 'Handler error' });
  }

  if (requestId) processed.add(requestId);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCartesiaRequest = verifyCartesiaRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cartesia`);
  });
}
