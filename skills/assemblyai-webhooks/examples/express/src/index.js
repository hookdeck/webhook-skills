// Generated with: assemblyai-webhooks skill
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
 * AssemblyAI does not sign webhooks. It sends the custom header you registered
 * with webhook_auth_header_name / webhook_auth_header_value, verbatim.
 * Node lowercases incoming header names, so lowercase the configured name.
 */
function verifyAssemblyAIRequest(headers, config = process.env) {
  const name = (config.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME || '').toLowerCase();
  const expected = config.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE;
  if (!name || !expected) return false; // never accept when unconfigured

  const received = headers[name];
  return typeof received === 'string' && safeEqual(received, expected);
}

/**
 * The payload only carries { transcript_id, status }. Fetch the transcript with
 * GET /v2/transcript/{transcript_id} to get the text or the error message.
 */
function handleEvent(payload) {
  const { transcript_id: transcriptId, status } = payload;

  switch (status) {
    case 'completed':
      console.log(`Transcript completed: ${transcriptId}`);
      // TODO: GET https://api.assemblyai.com/v2/transcript/{id} and use .text
      break;

    case 'error':
      console.log(`Transcript failed: ${transcriptId}`);
      // TODO: GET the transcript and read its .error field
      break;

    default:
      console.log(`Unhandled status: ${status} (transcript: ${transcriptId})`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/assemblyai', express.raw({ type: '*/*' }), (req, res) => {
  // A 4xx tells AssemblyAI the delivery failed and must not be retried.
  if (!verifyAssemblyAIRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook auth header' });
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
    console.error('Error handling AssemblyAI event:', err);
    // A 5xx (or no 2xx within 10s) makes AssemblyAI retry, up to 10 attempts.
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAssemblyAIRequest = verifyAssemblyAIRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/assemblyai`);
  });
}
