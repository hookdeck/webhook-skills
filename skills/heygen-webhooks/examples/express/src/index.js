// Generated with: heygen-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// HeyGen signs the raw body with HMAC-SHA256 (hex) in the `signature` header.
// The key is the whole endpoint secret (including "whsec_") as a UTF-8 string.
// This is NOT Standard Webhooks: no svix/standardwebhooks library, no base64 decoding.
function verifyHeyGenSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// express.raw with '*/*' keeps the raw Buffer whatever the content type is
app.post('/webhooks/heygen', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('signature');
  if (!signature) {
    return res.status(400).send('Missing signature header');
  }

  if (!Buffer.isBuffer(req.body) || !verifyHeyGenSignature(req.body, signature, process.env.HEYGEN_WEBHOOK_SECRET)) {
    console.error('HeyGen webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const data = event.event_data || {};

  // Retries resend the same payload: dedupe on event_data.video_id + event_type
  switch (event.event_type) {
    case 'avatar_video.success':
      console.log('Avatar video ready:', data.video_id, data.url);
      // TODO: Download the file (the URL is pre-signed and expires) and notify the user
      break;

    case 'avatar_video.fail':
      console.log('Avatar video failed:', data.video_id);
      // TODO: Mark the video as failed and alert the user
      break;

    case 'video_translate.success':
      console.log('Video translation complete:', data);
      // TODO: GET /v3/video-translations/{id} and store the translated video
      break;

    case 'video_translate.fail':
      console.log('Video translation failed:', data);
      // TODO: Mark the translation as failed
      break;

    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }

  // Return 2xx within 10 seconds to acknowledge receipt
  res.json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/heygen`);
  });
}
