require('dotenv').config();
const express = require('express');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to capture raw body for signature verification
app.use('/webhooks/elevenlabs', express.raw({ type: 'application/json' }));

// ElevenLabs client — used for SDK webhook verification (recommended by ElevenLabs).
// API key is required for client init; for webhook-only a placeholder is used.
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || 'webhook-only'
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ElevenLabs webhook endpoint
app.post('/webhooks/elevenlabs', async (req, res) => {
  const signature = req.headers['elevenlabs-signature'] ||
                   req.headers['ElevenLabs-Signature'];

  try {
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    const event = await elevenlabs.webhooks.constructEvent(rawBody, signature, secret);

    console.log(`Received ElevenLabs webhook: ${event.type}`);

    // Process based on event type
    switch (event.type) {
      case 'post_call_transcription':
        // Call ended and analysis is complete
        console.log('Call transcription completed:', event.data.conversation_id);
        // Your code: store event.data.transcript and event.data.analysis
        break;

      case 'post_call_audio':
        // Full call audio as base64-encoded MP3 in event.data.full_audio
        console.log('Call audio ready:', event.data.conversation_id);
        break;

      case 'call_initiation_failure':
        // Phone call didn't connect: failure_reason is busy, no-answer or unknown
        console.log('Call initiation failed:', event.data.conversation_id, event.data.failure_reason);
        break;

      case 'voice_removal_notice':
        // Handle voice removal notice
        console.log('Voice removal notice received:', event.data);
        // Your code: switch to one of event.data.suggested_voices
        break;

      case 'voice_removal_notice_withdrawn':
        // Handle voice removal notice withdrawal
        console.log('Voice removal notice withdrawn:', event.data);
        // Your code: keep using event.data.voice_id
        break;

      case 'voice_removed':
        // Handle voice removal completion
        console.log('Voice removed:', event.data);
        // Your code: stop using event.data.voice_id
        break;

      default:
        console.log('Unknown event type:', event.type);
    }

    // Return 200 to acknowledge receipt
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook verification failed:', error.message);

    const statusCode = error.statusCode === 400 ? 401 : (error.statusCode || 500);
    const message = error.message || 'Invalid signature';
    if (statusCode === 500) {
      res.status(500).send('Internal server error');
    } else {
      res.status(statusCode).json({ error: message });
    }
  }
});

// Start server only if not running in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`ElevenLabs webhook server listening on port ${PORT}`);
  });
}

// Export app for testing
module.exports = app;
