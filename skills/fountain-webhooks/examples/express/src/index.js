// Generated with: fountain-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Fountain signs the raw request body: X-OBIQ-SIGNATURE-V2 = hex(HMAC-SHA256(key = your
 * Fountain Hire private API token, message = body)). No prefix, no timestamp.
 * Accounts switched to applicant-ID signing are not supported.
 */
function verifyFountainSignature(rawBody, signatureHeader, secret = process.env.FOUNTAIN_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  if (!Buffer.isBuffer(rawBody)) return false;
  // Validate length and alphabet first: Buffer.from(x, 'hex') silently drops bad characters.
  if (typeof signatureHeader !== 'string' || !HEX_SHA256.test(signatureHeader)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest(); // 32 bytes
  const received = Buffer.from(signatureHeader, 'hex'); // hex is case-insensitive; 32 bytes
  return crypto.timingSafeEqual(received, expected);
}

/**
 * Fountain deliveries have no event-name field or header, so dispatch on the payload shape:
 * screening events are { applicant: {...} }, Post-Hire events are the flat worker object.
 */
function classify(payload) {
  if (payload.applicant && typeof payload.applicant === 'object') return 'applicant';
  if (typeof payload.id === 'string' && 'is_active' in payload) return 'worker';
  return null;
}

function handleEvent(kind, payload) {
  switch (kind) {
    case 'applicant': {
      const { applicant } = payload;
      console.log(`Applicant ${applicant.id} (${applicant.name}) is in stage: ${applicant.stage && applicant.stage.title}`);
      for (const check of Array.isArray(applicant.background_checks) ? applicant.background_checks : []) {
        console.log(`  Background check ${check.id || ''} status: ${check.status}`);
      }
      // TODO: sync the stage change or background-check result to your system
      break;
    }

    case 'worker':
      console.log(`Worker ${payload.id} (${payload.name}) is_active=${payload.is_active}`);
      for (const check of payload.data_collection_checks || []) {
        console.log(`  Document check ${check.id}: ${check.status}`);
      }
      // TODO: activate/deactivate the worker, or fetch approved documents
      break;

    default:
      console.log('Unhandled Fountain payload shape');
  }
}

// Read the body raw (any content type) so the exact bytes are verified; parse only afterwards.
app.post('/webhooks/fountain', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyFountainSignature(rawBody, req.headers['x-obiq-signature-v2'])) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(classify(payload), payload);
  } catch (err) {
    console.error('Error handling Fountain webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFountainSignature = verifyFountainSignature;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fountain`);
  });
}
