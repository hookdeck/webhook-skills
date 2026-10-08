const crypto = require('crypto');
const express = require('express');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Timing-safe string comparison (length-checked first, since
// crypto.timingSafeEqual throws on buffers of different length)
function safeEqual(a, b) {
  const ab = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Primary check: Basic Auth credentials embedded in the callback URL
// (https://user:pass@your-domain.com/webhooks/deepgram), which Deepgram
// sends as an Authorization: Basic header
function verifyBasicAuth(authHeader) {
  const username = process.env.DEEPGRAM_CALLBACK_USERNAME;
  const password = process.env.DEEPGRAM_CALLBACK_PASSWORD;
  if (!username || !password) return false; // fail closed if unconfigured
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // password may itself contain ':'
  if (sep === -1) return false;
  return safeEqual(decoded.slice(0, sep), username) && safeEqual(decoded.slice(sep + 1), password);
}

// Middleware to verify Deepgram webhooks
const verifyDeepgramWebhook = (req, res, next) => {
  if (!verifyBasicAuth(req.headers['authorization'])) {
    return res.status(401).json({ error: 'Invalid Basic Auth credentials' });
  }

  // Supplementary check: Deepgram does not send dg-token on every callback,
  // so compare it only when it is present (and an API Key ID is configured)
  const dgToken = req.headers['dg-token'];
  const expectedKeyId = process.env.DEEPGRAM_API_KEY_ID;
  if (dgToken && expectedKeyId && !safeEqual(dgToken, expectedKeyId)) {
    return res.status(403).json({ error: 'Invalid dg-token' });
  }

  next();
};

// Webhook endpoint
app.post(
  '/webhooks/deepgram',
  express.raw({ type: 'application/json' }),
  verifyDeepgramWebhook,
  (req, res) => {
    try {
      // Parse the webhook payload
      const payload = JSON.parse(req.body.toString());

      // The callback body is the /v1/listen response: { metadata, results }
      const requestId = payload.metadata?.request_id;
      const created = payload.metadata?.created;
      const duration = payload.metadata?.duration;
      const extra = payload.metadata?.extra; // values passed with extra=KEY:VALUE

      // Get the transcript from the first channel and alternative
      const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      const confidence = payload.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

      console.log('Webhook received:', {
        requestId,
        created,
        duration,
        extra,
        transcript: transcript.substring(0, 100) + '...', // Log first 100 chars
        confidence
      });

      // Process the transcription as needed
      // For example: save to database, trigger notifications, etc.

      // Return success to prevent retries
      res.status(200).json({
        status: 'success',
        requestId
      });
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(400).json({ error: 'Invalid webhook payload' });
    }
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Deepgram webhook server listening on port ${port}`);
    console.log('Webhook endpoint: POST /webhooks/deepgram');
  });
}

module.exports = app; // For testing