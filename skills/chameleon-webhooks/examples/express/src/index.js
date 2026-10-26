// Generated with: chameleon-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Chameleon signs the RAW request body: X-Chameleon-Signature is the bare hex
 * HMAC-SHA256 of the body, keyed with the Webhook Secret (UTF-8 bytes, as-is).
 * Nothing else (no timestamp, no id) is part of the signed content.
 */
function verifyChameleonSignature(rawBody, signature, secret = process.env.CHAMELEON_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  // The signature is validated as 64 hex chars, so both buffers are 32 bytes.
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

/**
 * Optional replay check from Chameleon's sample: sent_at must be within N seconds of now.
 * Off unless CHAMELEON_SENT_AT_TOLERANCE_SECONDS is set. Runs after the signature check.
 */
function sentAtWithinTolerance(sentAt, toleranceSeconds, now = Date.now()) {
  const ms = Date.parse(sentAt);
  if (Number.isNaN(ms)) return false;
  return Math.abs(now - ms) <= toleranceSeconds * 1000;
}

// Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
const seenEventIds = new Set();

function handleEvent(event) {
  const { kind, data = {} } = event;
  const who = data.profile ? data.profile.uid || data.profile.email || data.profile.id : 'unknown user';

  switch (kind) {
    case 'ping':
      console.log(`Ping from account ${data.account && data.account.domain}`);
      break;

    case 'tour.started':
    case 'tour.completed':
    case 'tour.exited':
    case 'tour.snoozed':
    case 'tour.button.clicked':
      console.log(`${kind}: ${data.tour && data.tour.name} (${who})`);
      // TODO: record onboarding progress for the user
      break;

    case 'survey.started':
    case 'survey.completed':
    case 'survey.exited':
    case 'survey.snoozed':
    case 'survey.button.clicked':
      console.log(`${kind}: ${data.survey && data.survey.name} (${who})`);
      // TODO: record survey progress
      break;

    case 'response.finished':
      console.log(`Survey answered: "${data.response && data.response.button_text}" (${who})`);
      // TODO: store data.response.button_text and data.response.input_text
      break;

    case 'embed.started':
    case 'embed.completed':
    case 'embed.exited':
    case 'embed.snoozed':
    case 'embed.button.clicked':
      console.log(`${kind}: ${data.embed && data.embed.name} (${who})`);
      break;

    case 'demo.started':
    case 'demo.reveal':
    case 'demo.finished':
    case 'demo.form.submitted':
    case 'demo.email.added':
      console.log(`${kind}: ${data.demo && data.demo.name} (${who})`);
      // TODO: sync the lead or engagement to your CRM
      break;

    case 'helpbar.search':
    case 'helpbar.answer':
    case 'helpbar.item.action':
    case 'helpbar.item.error':
      console.log(`${kind}: "${data.action && data.action.query}" (${who})`);
      // TODO: feed search analytics
      break;

    case 'alert.triggered':
      console.log('Chameleon alert triggered');
      // TODO: notify your team
      break;

    default:
      console.log(`Unhandled event: ${kind}`);
  }
}

// Read the body raw (any content type); verify before parsing it.
app.post('/webhooks/chameleon', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyChameleonSignature(rawBody, req.headers['x-chameleon-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.kind !== 'string') {
    return res.status(400).json({ error: 'Expected a JSON object with a kind' });
  }

  const tolerance = Number(process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS);
  if (tolerance > 0 && !sentAtWithinTolerance(event.sent_at, tolerance)) {
    return res.status(400).json({ error: 'sent_at is outside the allowed window' });
  }

  // Chameleon retries non-200 responses, so dedupe on the webhook id.
  if (event.id && seenEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Chameleon event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (event.id) seenEventIds.add(event.id);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyChameleonSignature = verifyChameleonSignature;
module.exports.sentAtWithinTolerance = sentAtWithinTolerance;
module.exports.seenEventIds = seenEventIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/chameleon`);
  });
}
