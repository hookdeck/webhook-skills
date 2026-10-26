// Generated with: vimeo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const webhookSecret = process.env.VIMEO_WEBHOOK_SECRET;

/**
 * Verify a Vimeo webhook signature.
 *
 * Vimeo has no webhook SDK, so we verify manually. When the webhook has a
 * `secret`, Vimeo sends `X-Webhook-Signature` = lowercase hex HMAC-SHA256 of the
 * RAW request body keyed with that secret. Nothing else is signed.
 */
function verifyVimeo(rawBody, signature, secret) {
  // Validate the format first: Buffer.from(x, 'hex') silently truncates bad hex.
  if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Both sides are 64-char lowercase hex strings, so the buffers have equal length.
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature.toLowerCase())
  );
}

// Vimeo webhook endpoint.
// express.raw({ type: '*/*' }) keeps the RAW body for any content type;
// parsing JSON first would break the signature.
app.post('/webhooks/vimeo', express.raw({ type: '*/*' }), (req, res) => {
  if (!webhookSecret) {
    console.error('VIMEO_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const signature = req.headers['x-webhook-signature'];
  if (!signature) {
    // Vimeo only signs webhooks that have a `secret` set via the API.
    return res.status(401).send('Missing X-Webhook-Signature header');
  }

  // req.body is a Buffer here (express.raw).
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyVimeo(rawBody, signature, webhookSecret)) {
    return res.status(401).send('Invalid signature');
  }

  // Signature verified - safe to parse.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event name is the `webhook_type` field in the body.
  // Vimeo sends no delivery ID: dedupe on webhook_type + data URI + timestamp.
  const data = event.data || {};

  switch (event.webhook_type) {
    case 'video-created':
      console.log(`Video created: ${data.video_uri}`);
      // TODO: record the new video
      break;

    case 'video-deleted':
      console.log(`Video deleted: ${data.video_uri}`);
      // TODO: remove the video from your catalog
      break;

    case 'video-transcode-playable':
      console.log(`Video playable: ${data.video_uri}`);
      // TODO: allow playback
      break;

    case 'video-transcode-complete':
      console.log(`Video transcode complete: ${data.video_uri} (${data.version_uri})`);
      // TODO: mark processing done
      break;

    case 'video-upload-failed':
      console.log(`Video upload failed: ${data.video_uri} (${data.error_type})`);
      // TODO: notify the uploader
      break;

    case 'transcript-status-complete':
      console.log(`Transcript ${data.transcript_status}: ${data.video_uri}`);
      // TODO: fetch the transcript if completed
      break;

    case 'live-event-started':
      console.log(`Live event started: ${data.event_uri}`);
      // TODO: notify viewers
      break;

    case 'live-event-ended':
      console.log(`Live event ended: ${data.event_uri}`);
      // TODO: close out the stream
      break;

    default:
      console.log(`Unhandled event type: ${event.webhook_type}`);
  }

  // Return 200 quickly to acknowledge receipt.
  res.json({ received: true });
});

// Health check endpoint.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing.
module.exports = app;

// Start the server only when run directly (not when imported for testing).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/vimeo`);
  });
}
