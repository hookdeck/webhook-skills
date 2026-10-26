// Generated with: oyster-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Oyster does not sign payloads. The only authentication is the sharedSecret you
 * registered, sent as `Authorization: Bearer <sharedSecret>`. Compare the WHOLE header
 * value, "Bearer " prefix included; don't strip or parse it. A static credential
 * authenticates the sender, not the body, and gives no replay protection, so use
 * HTTPS, dedupe on the event id and rotate the secret if it leaks.
 */
function verifyOysterRequest(headers, config = process.env) {
  const expected = config.OYSTER_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(event) {
  const { eventName, data = {} } = event;

  switch (eventName) {
    case 'hiring.employment_engaged':
      console.log(`Employment engaged: engagement ${data.engagementId}`);
      // TODO: mark the hire as engaged in your system
      break;

    case 'expenses.expense_approved':
      console.log(`Expense ${data.expenseId} approved (${data.previousReviewState} -> ${data.reviewState})`);
      // TODO: reimburse or book the expense
      break;

    case 'contract.change_applied':
      console.log(`Contract change ${data.engagementChangeId} applied (${data.changeType}, ${data.state})`);
      // TODO: sync the updated contract terms
      break;

    case 'benefits.enrollment_enrolled':
      console.log(`Benefits enrollment ${data.enrollmentId} enrolled for engagement ${data.engagementId}`);
      // TODO: record the enrollment
      break;

    default:
      console.log(`Unhandled Oyster event: ${eventName}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Oyster uses.
app.post('/webhooks/oyster', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyOysterRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.eventName !== 'string') {
    return res.status(400).json({ error: 'Expected a JSON object with an eventName' });
  }

  // Oyster may deliver the same webhook more than once: dedupe on event.id (wh_...)
  // in your own store before doing real work.
  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Oyster webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Oyster needs a 200 within 5 seconds.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyOysterRequest = verifyOysterRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/oyster`);
  });
}
