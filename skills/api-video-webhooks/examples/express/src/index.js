// Generated with: api-video-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify an api.video webhook signature.
 *
 * X-Api-Video-Signature is the bare hex HMAC-SHA256 of the raw request body,
 * keyed with the webhook's signatureSecret (used as UTF-8 bytes). Nothing else
 * is signed (no timestamp or id).
 *
 * @param {Buffer} rawBody - Raw request body bytes, exactly as received
 * @param {string|undefined} signatureHeader - X-Api-Video-Signature value
 * @param {string} secret - signatureSecret (sig_sec_...)
 * @returns {boolean}
 */
function verifyApiVideoSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !Buffer.isBuffer(rawBody)) {
    return false;
  }
  // Validate format before comparing: exactly 64 hex characters
  if (!HEX_SHA256.test(signatureHeader)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Hex is case-insensitive; compare equal-length ASCII buffers in constant time
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase(), 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}

// api.video webhook endpoint - raw body of any content type, so the exact bytes are verified
app.post('/webhooks/api-video',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-api-video-signature'];

    if (!verifyApiVideoSignature(req.body, signature, process.env.API_VIDEO_WEBHOOK_SECRET)) {
      console.error('api.video signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (event === null || typeof event !== 'object') {
      return res.status(400).send('Invalid payload');
    }

    // The event name is the body's `type` field (X-Api-Video-WebhookID is the subscription id)
    switch (event.type) {
      case 'video.source.recorded':
        console.log(`Source recorded for video ${event.videoId}`);
        // TODO: mark upload as received
        break;

      case 'video.encoding.quality.completed':
        console.log(`Video ${event.videoId} encoded: ${event.encoding} ${event.quality}`);
        // TODO: make the rendition available
        break;

      case 'live-stream.broadcast.started':
        console.log(`Live stream ${event.liveStreamId} started`);
        // TODO: notify viewers
        break;

      case 'live-stream.broadcast.ended':
        console.log(`Live stream ${event.liveStreamId} ended`);
        // TODO: finalize the recording
        break;

      case 'video.caption.generated':
        console.log(`Caption generated for video ${event.videoId}`);
        break;

      case 'video.summary.generated':
        console.log(`Summary generated for video ${event.videoId}`);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyApiVideoSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/api-video`);
  });
}
