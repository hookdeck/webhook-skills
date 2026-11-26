// Generated with: absorb-lms-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Absorb LMS sends absorb-signature: bare lowercase hex HMAC-SHA256 of the raw request
 * body, keyed with the webhook's Secret Key used as a UTF-8 string (no prefix, no timestamp).
 * The 64-hex check comes first because Buffer.from(x, 'hex') silently truncates bad input.
 */
function verifyAbsorbSignature(rawBody, signature, secret = process.env.ABSORB_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

function handleEvent(body) {
  const { eventName } = body;

  // Absorb's docs show only UserCreated and CertificateAwarded on the wire, so the casing
  // of the other names is untested. Compare case-insensitively.
  switch (String(eventName ?? '').toLowerCase()) {
    case 'usercreated':
      console.log('User created', body);
      // GET the new learner from the Absorb Integration API and sync it
      break;

    case 'onlinecourseactivated':
      console.log('Online course activated', body);
      break;

    case 'enrollmentcompletedbyadmin':
    case 'enrollmentcompletedbylearner':
      console.log(`Enrollment completed (${eventName})`, body);
      // Mark the course complete in your system
      break;

    case 'certificateawarded':
      console.log('Certificate awarded', body);
      // Fetch the certificate and notify the learner
      break;

    case 'competencyawarded':
      console.log('Competency awarded', body);
      break;

    case 'coursecreditsawarded':
      console.log('Course credits awarded', body);
      break;

    case 'userenrolledincoursebyadmin':
    case 'userenrolledincoursebylearner':
      console.log(`User enrolled in course (${eventName})`, body);
      break;

    default:
      console.log(`Unhandled event: ${eventName}`);
  }
}

// Read the body raw (any content type) so the signature covers the exact bytes received.
app.post('/webhooks/absorb-lms', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyAbsorbSignature(rawBody, req.headers['absorb-signature'])) {
    // Absorb's Test Webhook button sends a random signature, so it always lands here.
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(body);
  } catch (err) {
    console.error('Error handling Absorb LMS event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAbsorbSignature = verifyAbsorbSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/absorb-lms`);
  });
}
