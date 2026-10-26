// Generated with: tokity-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const SIGNATURE_PREFIX = 'sha256=';
// Standard padded base64 of a 32-byte digest: 43 characters plus one "=".
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Tokity signs the raw request body with HMAC-SHA256, keyed with the webhook's secret
 * (its UTF-8 bytes, used as-is), and sends "sha256=" + standard base64 in `x-dd-signature`.
 * Nothing else is signed: no timestamp and no id.
 *
 * The bare digest (no "sha256=") is accepted too. The value is checked against the exact
 * 44-character base64 form first, then the base64 STRINGS are compared in constant time.
 * Decoding is avoided on purpose: Buffer.from(x, 'base64') silently drops bad characters
 * and accepts non-canonical last characters.
 */
function verifyTokitySignature(rawBody, signatureHeader, secret = process.env.TOKITY_WEBHOOK_SECRET) {
  if (!secret || typeof signatureHeader !== 'string' || !Buffer.isBuffer(rawBody)) return false;

  const received = signatureHeader.startsWith(SIGNATURE_PREFIX)
    ? signatureHeader.slice(SIGNATURE_PREFIX.length)
    : signatureHeader;
  if (!BASE64_SHA256.test(received)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : 'unknown');

/**
 * Tokity payloads carry no event name. A chat webhook item is a chat session
 * (status plus pastStatus). Anything else is a ticket: a webhook item is the ticket plus
 * `from` (its previous state, null on creation); an Events action sends the ticket without `from`.
 */
function classify(item) {
  return typeof item.status === 'string' && Array.isArray(item.pastStatus) ? 'chat' : 'ticket_change';
}

function handleChat(chat) {
  const past = (Array.isArray(chat.pastStatus) ? chat.pastStatus : []).filter((s) => typeof s === 'string');
  const ref = isObject(chat.reference) ? chat.reference : null;
  console.log(`Chat session ${text(chat.id)} is ${text(chat.status)} (past: ${past.join(', ') || 'none'})`);
  if (ref && ref.type === 'ticket') {
    console.log(`  about ticket ${text(ref.id)}`);
  }
  // TODO: notify technicians, or follow up on 'missed' / 'callback' sessions
}

function handleTicket(ticket) {
  const id = text(ticket.id);
  if (Object.hasOwn(ticket, 'from') && ticket.from === null) {
    console.log(`Ticket ${id} created`);
    // TODO: act on the new ticket
  } else if (isObject(ticket.from)) {
    const previous = ticket.from;
    const changed = Object.keys(ticket).filter(
      (key) => key !== 'from' && JSON.stringify(ticket[key]) !== JSON.stringify(previous[key])
    );
    console.log(`Ticket ${id} changed: ${changed.join(', ') || 'no fields'}`);
    // TODO: act on the fields that changed
  } else {
    console.log(`Ticket ${id} event (no previous state, sent by a Tokity Events action)`);
  }
}

function handleItem(item) {
  const kind = classify(item);
  if (kind === 'chat') {
    handleChat(item);
  } else {
    handleTicket(item);
  }
  return kind;
}

// Read the body raw so the exact bytes are verified, whatever Content-Type Tokity uses.
app.post('/webhooks/tokity', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyTokitySignature(rawBody, req.headers['x-dd-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing x-dd-signature' });
  }

  // Parse only after the signature check. Treat everything in the body as untrusted.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Chat webhooks send an array; ticket webhooks may too. Accept one object or a list.
  const items = Array.isArray(payload) ? payload : [payload];
  if (!items.every(isObject)) {
    return res.status(400).json({ error: 'Expected a JSON object or an array of objects' });
  }

  try {
    items.forEach(handleItem);
  } catch (err) {
    console.error('Error handling Tokity webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTokitySignature = verifyTokitySignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tokity`);
  });
}
