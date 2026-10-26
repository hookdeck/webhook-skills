// Generated with: live-tennis-api-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Verify the X-LTAPI-Signature header.
 * Format: "sha256=<64 hex chars>", the HMAC-SHA256 of the raw body keyed with
 * the webhook secret. X-LTAPI-Timestamp is NOT signed, so it plays no part here.
 */
function verifyLiveTennisSignature(rawBody, header, secret) {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(typeof header === 'string' ? header : '');
  if (!match) {
    return { valid: false, error: 'Malformed X-LTAPI-Signature header' };
  }

  // The header is exactly 64 hex chars, so Buffer.from(..., 'hex') can't truncate
  const received = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();

  return crypto.timingSafeEqual(received, expected)
    ? { valid: true }
    : { valid: false, error: 'Invalid signature' };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Live Tennis API webhook endpoint
// IMPORTANT: express.raw({ type: '*/*' }) keeps the exact bytes that were signed,
// whatever Content-Type the request carries.
app.post('/webhooks/live-tennis-api',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.LIVE_TENNIS_API_WEBHOOK_SECRET;
    if (!secret) {
      console.error('LIVE_TENNIS_API_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const signatureHeader = req.headers['x-ltapi-signature'];
    if (!signatureHeader) {
      return res.status(400).json({ error: 'Missing X-LTAPI-Signature header' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const result = verifyLiveTennisSignature(rawBody, signatureHeader, secret);
    if (!result.valid) {
      console.error('Live Tennis API signature verification failed:', result.error);
      return res.status(401).json({ error: result.error });
    }

    // Parse only after verification
    let frame;
    try {
      frame = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    // The signed body carries the frame type; X-LTAPI-Event (unsigned) is the fallback.
    // Delivery is at-most-once: dedupe score frames on `sequence` and point frames on `point.seq`.
    const event = frame.type || req.headers['x-ltapi-event'];
    console.log(`Received Live Tennis API frame: ${event} (match ${frame.match_id})`);

    switch (event) {
      case 'score':
        console.log('Score:', frame.match_id, frame.sets, frame.games, frame.points);
        // TODO: update your scoreboard (each score frame is the complete current score)
        break;
      case 'point':
        console.log('Point:', frame.match_id, frame.point?.seq, 'won by', frame.point?.winner);
        // TODO: store the point keyed on (match_id, point.seq); recover gaps via GET /matches/{id}/points?after_seq=
        break;
      case 'break_point':
        console.log('Break point:', frame.match_id, 'server', frame.server, 'returner', frame.returner);
        // TODO: raise an alert
        break;
      case 'break_point_result':
        console.log('Break point result:', frame.match_id, frame.outcome);
        // TODO: settle the break point (outcome is "held" or "broken")
        break;
      default:
        console.log('Unhandled Live Tennis API event:', event);
    }

    return res.status(200).json({ received: true, event });
  }
);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Live Tennis API webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/live-tennis-api`);
  });
}

module.exports = { app, verifyLiveTennisSignature };
