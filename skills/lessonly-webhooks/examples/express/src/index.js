// Generated with: lessonly-webhooks skill
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
 * Lessonly (Seismic Learning) does not sign payloads. The credential is the
 * Authorization header, sent verbatim from lesson_completed_callback_authorization.
 * Compare the WHOLE header value, including any "Bearer " or "Basic " prefix you
 * set; do not strip, parse or base64-decode it.
 *
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection: use HTTPS and rotate the credential if it leaks.
 */
function verifyLessonlyRequest(headers, config = process.env) {
  const expected = config.LESSONLY_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Lessonly sends one webhook, "lesson completed", with no event-type field. The
 * payload is not documented; lesson_id, user_id and completed_at are ILLUSTRATIVE.
 */
function handleLessonCompleted(payload) {
  console.log(
    `Lesson completed: lesson ${payload.lesson_id} by user ${payload.user_id} at ${payload.completed_at}`
  );
  // TODO: record the completion (dedupe on user + lesson, there is no event ID)
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Lessonly uses.
app.post('/webhooks/lessonly', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyLessonlyRequest(req.headers)) {
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
    handleLessonCompleted(payload);
  } catch (err) {
    console.error('Error handling Lessonly webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyLessonlyRequest = verifyLessonlyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/lessonly`);
  });
}
