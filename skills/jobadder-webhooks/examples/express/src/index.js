// Generated with: jobadder-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * JobAdder does not sign payloads. The only credential is the optional `authorization`
 * value set on the webhook, which JobAdder sends back as the Authorization header.
 * Compare the WHOLE header value (including any "Basic " / "Bearer " prefix) to
 * JOBADDER_AUTHORIZATION. Never strip, parse or base64-decode it.
 */
function verifyJobAdderRequest(headers, config = process.env) {
  const expected = config.JOBADDER_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(payload) {
  switch (payload.event) {
    case 'candidate_status_changed':
      console.log(`Candidate status changed (event ${payload.eventId})`);
      // TODO: sync the candidate's new status to your system
      break;

    case 'job_status_changed':
      console.log(`Job status changed (event ${payload.eventId})`);
      // TODO: update the job in your system
      break;

    case 'jobapplication_status_changed':
      console.log(`Job application status changed (event ${payload.eventId})`);
      // TODO: move the application along your pipeline
      break;

    case 'placement_approved':
      console.log(`Placement approved (event ${payload.eventId})`);
      // TODO: trigger onboarding or invoicing
      break;

    default:
      console.log(`Unhandled JobAdder event: ${payload.event}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type JobAdder uses.
app.post('/webhooks/jobadder', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyJobAdderRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling JobAdder webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyJobAdderRequest = verifyJobAdderRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/jobadder`);
  });
}
