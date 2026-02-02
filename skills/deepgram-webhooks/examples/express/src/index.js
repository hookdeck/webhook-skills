const express = require('express');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware to verify Deepgram webhooks
const verifyDeepgramWebhook = (req, res, next) => {
  const dgToken = req.headers['dg-token'];
  const expectedToken = process.env.DEEPGRAM_API_KEY_ID;

  if (!dgToken) {
    return res.status(401).json({ error: 'Missing dg-token header' });
  }

  if (dgToken !== expectedToken) {
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

      // Extract key information from the transcription
      const requestId = payload.request_id;
      const created = payload.created;
      const duration = payload.duration;

      // Get the transcript from the first channel and alternative
      const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      const confidence = payload.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

      console.log('Webhook received:', {
        requestId,
        created,
        duration,
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