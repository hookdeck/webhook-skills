// Generated with: live-tennis-api-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Live Tennis API's receiver check: reject a `t` more than 5 minutes from your clock.
const TOLERANCE_SECONDS = 300;

/**
 * Verify the X-LTAPI-Signature-V1 header.
 * Format: "t=<unix seconds>,v1=<hex>". Each v1 is the hex HMAC-SHA256, keyed with
 * the webhook secret, of "<t>.<raw request body>". Accept if any v1 matches.
 * Never fall back to the deprecated X-LTAPI-Signature: it doesn't cover the timestamp.
 */
function verifyLiveTennisSignature(rawBody, header, secret, now = Math.floor(Date.now() / 1000)) {
  if (typeof header !== 'string') {
    return { valid: false, error: 'Missing X-LTAPI-Signature-V1 header' };
  }

  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed X-LTAPI-Signature-V1 header' };
  }
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) {
    return { valid: false, error: 'Timestamp outside the 5-minute window' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();

  // Check the hex shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  const matched = signatures.some(
    (sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)
  );

  return matched
    ? { valid: true, timestamp: Number(timestamp) }
    : { valid: false, error: 'Invalid signature' };
}

// Seen delivery_ids, kept until t + 5 minutes. With several workers, use a shared
// store with an atomic insert-if-absent (for example Redis SET NX EX) instead.
const seenDeliveries = new Map();

function firstDelivery(deliveryId, timestamp) {
  const now = Math.floor(Date.now() / 1000);
  for (const [id, expiresAt] of seenDeliveries) {
    if (expiresAt < now) seenDeliveries.delete(id);
  }
  if (seenDeliveries.has(deliveryId)) return false;
  seenDeliveries.set(deliveryId, timestamp + TOLERANCE_SECONDS);
  return true;
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

    const signatureHeader = req.headers['x-ltapi-signature-v1'];
    if (!signatureHeader) {
      return res.status(400).json({ error: 'Missing X-LTAPI-Signature-V1 header' });
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

    // delivery_id is unique per delivery and inside the signed body
    if (frame.delivery_id && !firstDelivery(frame.delivery_id, result.timestamp)) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    // The signed body carries the frame type; X-LTAPI-Event (unsigned) is the fallback.
    const event = frame.type || req.headers['x-ltapi-event'];
    console.log(`Received Live Tennis API frame: ${event} (match ${frame.match_id})`);

    switch (event) {
      case 'score':
        // The complete current score: apply it if its `sequence` is newer than the one you hold
        console.log('Score:', frame.match_id, frame.sequence);
        break;
      case 'score_withdrawn':
        // Discard the state with this sequence and resume from the next score frame
        console.log('Score withdrawn:', frame.match_id, frame.superseded_sequence, frame.kind);
        break;
      case 'point':
        // Store keyed on (match_id, point.seq); fill gaps from GET /matches/{id}/points?after_seq=
        console.log('Point:', frame.match_id, frame.point?.seq);
        break;
      case 'break_point':
        console.log('Break point:', frame.match_id, 'server', frame.server, 'returner', frame.returner);
        break;
      case 'break_point_result':
        // outcome is "held" or "broken"
        console.log('Break point result:', frame.match_id, frame.outcome);
        break;
      case 'status':
        console.log('Status change:', frame.match_id);
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
