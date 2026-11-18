require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Verify a Dial webhook signature.
 *
 * X-Dial-Signature is `t=<unix-seconds>,v1=<hex>`, where v1 is the hex HMAC-SHA256 of
 * `{t}.{raw body}` keyed with the full signing secret (UTF-8, `whsec_` prefix included).
 * A toleranceSeconds of 0 skips the timestamp check.
 */
function verifyDialSignature(rawBody, header, secret, toleranceSeconds = 0) {
  let t = null;
  const v1 = [];
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  if (!t || !/^\d{1,12}$/.test(t) || v1.length === 0) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  // Validate shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  return v1.some((sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex')));
}

// Optional replay window in seconds. Off by default: retries and replays, including
// Hookdeck's, can carry the original timestamp, so a window would reject late redeliveries.
// Set DIAL_WEBHOOK_TOLERANCE_SECONDS to a positive whole number (Dial's docs suggest 300) to
// opt in; anything else leaves the check off.
function toleranceSeconds() {
  const raw = (process.env.DIAL_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  return /^\d+$/.test(raw) ? Number(raw) : 0;
}

// Raw body for any content type so we verify the exact bytes Dial sent
app.use('/webhooks/dial', express.raw({ type: '*/*' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhooks/dial', (req, res) => {
  const signature = req.headers['x-dial-signature'];
  const secret = process.env.DIAL_WEBHOOK_SECRET;

  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Dial-Signature header' });
  }
  if (!secret) {
    return res.status(500).json({ error: 'DIAL_WEBHOOK_SECRET not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

  if (!verifyDialSignature(rawBody, signature, secret, toleranceSeconds())) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!event || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Dedupe on the event id (also sent as X-Dial-Event-ID): delivery is at-least-once
  const eventId = event.id || req.headers['x-dial-event-id'];
  const eventType = event.type || req.headers['x-dial-event-type'];
  const data = event.data || {};
  console.log(`Received Dial webhook: ${eventType} (${eventId})`);

  switch (eventType) {
    case 'message.received':
      // channel: sms | imessage | rcs | whatsapp; groupId is set for group messages
      console.log(`Inbound ${data.channel} message from ${data.from}`);
      break;
    case 'message.status_changed':
      console.log(`Message ${data.messageId}: delivery=${data.deliveryState} read=${data.readState}`);
      break;
    case 'call.status_changed':
      console.log(`Call ${data.callId} is now ${data.status && data.status.state}`);
      break;
    case 'call.ended':
      console.log(`Call ${data.callId} ended: ${data.status} (${data.durationSeconds}s)`);
      break;
    case 'call.transcribed':
      // Thin event: fetch GET /api/v1/calls/{callId} (relatedObject.url) for the transcript
      console.log(`Transcript ready for call ${data.callId}`);
      break;
    case 'number.status_changed':
      // version 2 payload; `ready` and `degraded` are both terminal
      console.log(`Number ${data.number} is ${data.status}`);
      break;
    case 'webhook.ping':
      console.log('Ping received');
      break;
    default:
      console.log('Unhandled event type:', eventType);
  }

  res.sendStatus(200);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Dial webhook server listening on port ${PORT}`);
  });
}

module.exports = app;
