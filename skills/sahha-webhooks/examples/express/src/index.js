// Generated with: sahha-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Sahha signs every delivery with:
//   X-Signature   lowercase hex HMAC-SHA256 of the raw request body (no prefix)
//   X-Event-Type  e.g. ScoreCreatedIntegrationEvent
//   X-External-Id the profile's external identifier in your system
// The key is the Dashboard secret as UTF-8 bytes. Only the body is signed, so
// there is no timestamp to check.
// ---------------------------------------------------------------------------

const SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * Verify Sahha's X-Signature over the raw body.
 *
 * @param {Buffer} rawBody - the exact bytes Sahha sent
 * @param {string|undefined} signature - X-Signature header value
 * @param {string} secret - the Dashboard secret key
 * @returns {boolean}
 */
function verifySahhaSignature(rawBody, signature, secret) {
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) return false;

  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  // Hex is case-insensitive; decoding to bytes handles that.
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : undefined);

// Every field of the parsed body is untrusted: check types before reading.
function handleEvent(eventType, externalId, payload) {
  switch (eventType) {
    case 'ScoreCreatedIntegrationEvent':
      console.log(`Score for ${externalId}: ${str(payload.type)} = ${payload.score} (${str(payload.state)})`);
      break;
    case 'BiomarkerCreatedIntegrationEvent':
      console.log(
        `Biomarker for ${externalId}: ${str(payload.type)} = ${str(payload.value)} ${str(payload.unit) ?? ''}`
      );
      break;
    case 'ArchetypeCreatedIntegrationEvent':
      console.log(`Archetype for ${externalId}: ${str(payload.name)} = ${str(payload.value)}`);
      break;
    case 'TagReceivedIntegrationEvent':
      console.log(`Tag for ${externalId}: ${str(payload.name)} (${str(payload.type)})`);
      break;
    case 'DataLogReceivedIntegrationEvent': {
      const logs = Array.isArray(payload.dataLogs) ? payload.dataLogs.filter(isObject) : [];
      console.log(`Data logs for ${externalId}: ${logs.length} ${str(payload.dataType)} sample(s)`);
      break;
    }
    default:
      console.log(`Unhandled Sahha event type: ${eventType}`);
  }
}

// express.raw with '*/*' keeps the exact bytes whatever the content type is.
app.post('/webhooks/sahha', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SAHHA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SAHHA_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySahhaSignature(rawBody, req.get('X-Signature'), secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse only after the signature check.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!isObject(payload)) {
    return res.status(400).json({ error: 'Unexpected payload shape' });
  }

  const eventType = req.get('X-Event-Type');
  if (!eventType) {
    return res.status(400).json({ error: 'Missing X-Event-Type header' });
  }

  try {
    // Sahha needs a 2xx within 30 seconds; enqueue heavy work in production.
    // Retries and out-of-order delivery are possible: make handlers idempotent.
    handleEvent(eventType, req.get('X-External-Id') ?? str(payload.externalId), payload);
  } catch (err) {
    console.error('Error handling Sahha event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Sahha webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sahha`);
  });
}

module.exports = { app, server, verifySahhaSignature };
