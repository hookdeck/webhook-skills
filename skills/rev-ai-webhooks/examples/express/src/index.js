// Generated with: rev-ai-webhooks skill
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
 * Rev AI does not sign payloads. The credential is the Authorization header you set in
 * notification_config.auth_headers when submitting the job, e.g. "Bearer <token>".
 * Compare the WHOLE header value (scheme prefix included) with REV_AI_AUTHORIZATION.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyRevAiRequest(headers, config = process.env) {
  const expected = config.REV_AI_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(payload) {
  const job = payload.job;
  if (!job || typeof job !== 'object') {
    console.log('Unhandled Rev AI payload (no job object)');
    return;
  }

  switch (job.status) {
    case 'transcribed':
      console.log(`Job ${job.id} transcribed (${job.duration_seconds}s)`);
      // TODO: fetch the transcript with GET /speechtotext/v1/jobs/{id}/transcript
      break;

    case 'failed':
      console.log(`Job ${job.id} failed: ${job.failure} - ${job.failure_detail}`);
      // TODO: alert, or resubmit once the cause (e.g. download_failure) is fixed
      break;

    default:
      console.log(`Unhandled Rev AI job status: ${job.status}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Rev AI uses.
app.post('/webhooks/rev-ai', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyRevAiRequest(req.headers)) {
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
    console.error('Error handling Rev AI webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Rev AI retries every 30 minutes for 24 hours until it receives a 200.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRevAiRequest = verifyRevAiRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/rev-ai`);
  });
}
