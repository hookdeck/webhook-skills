// Generated with: northpass-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Standard base64 of a 32-byte digest: exactly 43 characters plus one "=".
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Northpass signs the raw request body with HMAC-SHA256 keyed by the school's
 * shared secret and sends the padded base64 digest in X-Northpass-Hmac-SHA256.
 * Nothing else is signed (no timestamp), so there is no replay window to check.
 *
 * The header is validated for exact format first, then compared as a string in
 * constant time, so a value that merely decodes to the same bytes is rejected.
 */
function verifyNorthpassSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  if (typeof signature !== 'string' || !SIGNATURE_FORMAT.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// In-memory de-duplication on the event id. Use a durable store in production.
const seen = new Set();

function handleEvent(event) {
  const { type, id } = event;

  switch (type) {
    case 'learner_created_events':
      console.log(`Learner created (event ${id})`);
      // TODO: create the learner in your system (see data.included for the person)
      break;

    case 'person_activated_events':
      console.log(`Person activated (event ${id})`);
      // TODO: mark the learner as active
      break;

    case 'learner_enrolled_to_course_events':
      console.log(`Learner enrolled in a course (event ${id})`);
      // TODO: record the enrollment (data.relationships.course / person)
      break;

    case 'learner_started_course_events':
      console.log(`Learner started a course (event ${id})`);
      // TODO: record course progress
      break;

    case 'course_completed_events':
      console.log(`Course completed (event ${id})`);
      // TODO: issue credit or update the CRM
      break;

    case 'quiz_completed_events':
      console.log(`Quiz completed with value ${event.attributes?.value} (event ${id})`);
      // TODO: store the score (attributes.value, attributes.minimum_passing_score)
      break;

    case 'course_published_events':
      console.log(`Course published, version ${event.attributes?.version_number} (event ${id})`);
      // TODO: refresh your course catalog
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified, then parse.
app.post('/webhooks/northpass', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-northpass-hmac-sha256'];

  if (!verifyNorthpassSignature(req.body, signature, process.env.NORTHPASS_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const event = payload && typeof payload === 'object' ? payload.data : null;
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Expected a JSON:API body with a data object' });
  }

  if (event.id && seen.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Northpass event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (event.id) seen.add(event.id);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNorthpassSignature = verifyNorthpassSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/northpass`);
  });
}
