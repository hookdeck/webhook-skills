// Generated with: speechmatics-webhooks skill
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
 * Speechmatics does not sign notifications. It sends the header you listed in
 * notification_config[].auth_headers, verbatim. The whole value is compared:
 * a "Bearer " prefix is part of the value, not parsed off.
 * Node lowercases incoming header names, so lowercase the configured name.
 * A static credential authenticates the sender only: no body signature, no replay protection.
 */
function verifySpeechmaticsRequest(headers, config = process.env) {
  const name = (config.SPEECHMATICS_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const expected = config.SPEECHMATICS_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured

  const received = headers[name];
  return typeof received === 'string' && safeEqual(received, expected);
}

/**
 * Speechmatics appends ?id=<job id>&status=<status> to your URL. The body is whatever
 * `contents` you requested (JSON, text, multipart) and may be empty, so dispatch on the query.
 */
function handleEvent({ jobId, status, contentType, body }) {
  switch (status) {
    case 'success':
      console.log(`Job succeeded: ${jobId} (${describeBody(contentType, body)})`);
      // TODO: store the transcript from `body`, or fetch it from the API by job id
      break;

    case 'error':
      console.log(`Job failed: ${jobId} (${describeBody(contentType, body)})`);
      // TODO: only jobinfo is sent on error; read the job's errors from the API
      break;

    case 'fetch_error':
      console.log(`Could not fetch the data file for job: ${jobId}`);
      break;

    case 'trim_error':
      console.log(`Could not process the audio file for job: ${jobId}`);
      break;

    default:
      console.log(`Unhandled status: ${status} (job: ${jobId})`);
  }
}

function describeBody(contentType, body) {
  if (!body || body.length === 0) return 'no body';
  return `${contentType || 'unknown type'}, ${body.length} bytes`;
}

// Authenticate first, before the (possibly large) body is read.
function requireSpeechmaticsAuth(req, res, next) {
  if (!verifySpeechmaticsRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook auth header' });
  }
  next();
}

// Raw body, any content type: transcripts, media and multipart all arrive here.
// Speechmatics retries on 413, so keep the limit above the media you request.
const rawBody = express.raw({ type: '*/*', limit: '100mb' });

function receive(req, res) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0); // empty body: no parse

  // Parse only after authentication, and only JSON content types.
  if (body.length > 0 && /json/.test(contentType)) {
    try {
      JSON.parse(body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  try {
    handleEvent({
      jobId: req.query.id,
      status: req.query.status,
      contentType,
      body,
    });
  } catch (err) {
    console.error('Error handling Speechmatics notification:', err);
    // A non-2xx makes Speechmatics retry until its timeout.
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

// The notification method is user-chosen: POST (default) or PUT.
app
  .route('/webhooks/speechmatics')
  .post(requireSpeechmaticsAuth, rawBody, receive)
  .put(requireSpeechmaticsAuth, rawBody, receive)
  .all((req, res) => res.set('Allow', 'POST, PUT').status(405).json({ error: 'Method not allowed' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySpeechmaticsRequest = verifySpeechmaticsRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST or PUT http://localhost:${PORT}/webhooks/speechmatics`);
  });
}
