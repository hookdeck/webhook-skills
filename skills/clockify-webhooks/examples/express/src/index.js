// Generated with: clockify-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Clockify doesn't sign webhook bodies. Every delivery carries the webhook's
// token (the "Signing secret", authToken in the API) in Clockify-Signature,
// unchanged on every request. Compare it in constant time. Each webhook has
// its own token, so CLOCKIFY_WEBHOOK_SIGNING_SECRET takes a comma-separated
// list when several webhooks point at this endpoint.
// ---------------------------------------------------------------------------

/** Constant-time string comparison that doesn't leak the length. */
function safeEqual(given, expected) {
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/** Split the configured value into tokens (JWTs contain no commas). */
function parseTokens(value) {
  return String(value || '').split(',').map((token) => token.trim()).filter(Boolean);
}

/**
 * Check Clockify-Signature against the configured webhook token(s).
 * @param {string|undefined} signature - the Clockify-Signature header
 * @param {string[]} tokens - from CLOCKIFY_WEBHOOK_SIGNING_SECRET
 * @returns {boolean}
 */
function verifyClockifySignature(signature, tokens) {
  const given = String(signature || '').trim();
  if (!given || tokens.length === 0) return false;
  let ok = false;
  for (const token of tokens) ok = safeEqual(given, token) || ok;   // check every token
  return ok;
}

/**
 * The body is the changed object itself: a time entry, project, task, client,
 * user, invoice and so on, depending on the webhook's event. There's no
 * envelope, so take the event from the webhook (one event per webhook) or the
 * clockify-webhook-event-type header when it's present.
 */
function handleEvent(eventType, entity) {
  switch (eventType) {
    case 'NEW_TIME_ENTRY':
    case 'TIME_ENTRY_UPDATED':
    case 'TIMER_STOPPED':
      console.log(`Time entry ${entity.id}: ${eventType}`, entity.timeInterval);
      break;
    case 'NEW_PROJECT':
    case 'PROJECT_UPDATED':
      console.log(`Project ${entity.name} (${entity.id}): ${eventType}`);
      break;
    default:
      console.log(`Clockify ${eventType || 'event'} for ${entity.id}`);
  }
  return { received: true, event_type: eventType, id: entity.id ?? null };
}

// express.raw() keeps the body as bytes, the same as the signed examples.
app.post('/webhooks/clockify', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const tokens = parseTokens(process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET);
  if (tokens.length === 0) {
    console.error('CLOCKIFY_WEBHOOK_SIGNING_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!verifyClockifySignature(req.get('clockify-signature'), tokens)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  let entity;
  try {
    entity = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!entity || typeof entity !== 'object') entity = {};

  const eventType = req.get('clockify-webhook-event-type') || null;
  return res.status(200).json(handleEvent(eventType, entity));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Clockify webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/clockify`);
  });
}

module.exports = { app, verifyClockifySignature, parseTokens, handleEvent };
