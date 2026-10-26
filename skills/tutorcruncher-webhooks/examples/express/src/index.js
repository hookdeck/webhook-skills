// Generated with: tutorcruncher-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// TutorCruncher's docs don't name the HTTP method, so accept all of these.
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Webhook-Signature is the bare lowercase hex HMAC-SHA256 of the raw body, keyed with the
 * integration's private API key (UTF-8 bytes, used as-is). No prefix, id or timestamp.
 * Not Standard Webhooks, despite the header name.
 */
function verifyTutorCruncherSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature.toLowerCase(), 'utf8'); // hex is case-insensitive
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// One webhook carries {events: [...]}; each element has its own `action`.
function handleEvent(event) {
  const subject = isObject(event.subject) ? event.subject : {};

  switch (event.action) {
    case 'CREATED_A_CONTRACTOR':
      console.log(`Tutor created: ${subject.id} (${subject.email})`);
      // TODO: onboard the tutor in your system
      break;

    case 'CHANGED_CONTRACTOR_STATUS':
      console.log(`Tutor status changed: ${subject.id} -> ${subject.status}`);
      // TODO: sync the tutor's status
      break;

    case 'CLIENT_ENQUIRY':
      console.log(`Client enquiry from: ${subject.id}`);
      // TODO: create a lead
      break;

    case 'CREATED_AN_APPOINTMENT':
      console.log(`Lesson created: ${subject.id}`);
      // TODO: sync to your calendar
      break;

    case 'RAISED_INVOICE':
      console.log(`Invoice raised: ${subject.id}`);
      // TODO: push to accounting
      break;

    default:
      console.log(`Unhandled action: ${event.action}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.all('/webhooks/tutorcruncher', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.has(req.method)) {
    res.set('Allow', [...METHODS].join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // A request with no body is verified over zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['webhook-signature'];

  if (!verifyTutorCruncherSignature(rawBody, signature, process.env.TUTORCRUNCHER_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  // Verified and empty (e.g. GET): acknowledge.
  if (rawBody.length === 0) {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Treat every field as untrusted: check types before reading into them.
  if (!isObject(payload) || !Array.isArray(payload.events)) {
    return res.status(400).json({ error: 'Expected {"events": [...]}' });
  }

  try {
    for (const event of payload.events) {
      if (isObject(event) && typeof event.action === 'string') handleEvent(event);
    }
  } catch (err) {
    console.error('Error handling TutorCruncher webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTutorCruncherSignature = verifyTutorCruncherSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/tutorcruncher`);
  });
}
