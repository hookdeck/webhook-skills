// Generated with: wistia-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// X-Wistia-Signature is the bare hex HMAC-SHA256 of the raw body: exactly 64 hex characters
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyWistiaSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;

  // Key = the secret's UTF-8 bytes; message = the raw body bytes, untouched
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: format validated above
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Wistia delivers at least once, so remember event uuids we've handled.
// In production use a database or Redis with a TTL instead of process memory.
const seenEventUuids = new Set();

function handleEvent(event) {
  switch (event.type) {
    case 'media.created':
      console.log('Media created:', event.payload.media?.id);
      // TODO: Record the media as uploaded
      break;
    case 'media.processing':
      console.log('Media processing:', event.payload.media?.id);
      break;
    case 'media.ready':
      console.log('Media ready:', event.payload.media?.id);
      // TODO: Publish the video; it is ready for playback
      break;
    case 'media.failed':
      console.log('Media failed:', event.payload.media?.id);
      // TODO: Mark the media as failed and notify the uploader
      break;
    case 'media.updated':
      console.log('Media updated:', event.payload.media?.id, event.payload.previous_attributes);
      break;
    case 'media.transcript_updated':
      console.log('Transcript updated:', event.payload.media?.id, event.payload.transcript?.language_code);
      break;
    case 'media.transcript_failed':
      console.log('Transcript failed:', event.payload.media?.id, event.payload.transcript?.reason);
      break;
    case 'media.deleted':
      console.log('Media deleted:', event.payload.media?.id);
      // TODO: Remove the media from your catalog
      break;
    case 'media.translation_created':
      console.log('Translation created:', event.payload.media?.id);
      break;
    case 'media.localization_created':
      console.log('Localization created:', event.payload.localization?.hashed_id);
      break;
    case 'media.localization_failed':
      console.log('Localization failed:', event.payload.localization?.hashed_id);
      break;
    case 'viewing_session.play':
      console.log('Play:', event.payload.viewing_session?.id, event.payload.media?.id);
      break;
    case 'viewing_session.percent_watched':
      console.log('Percent watched:', event.payload.percent_watched, event.payload.media?.id);
      break;
    case 'viewing_session.turnstile.converted':
      console.log('Form converted:', event.payload.viewing_session?.id);
      // TODO: Send the lead to your CRM
      break;
    case 'viewing_session.call_to_action.converted':
      console.log('Call to action converted:', event.payload.viewing_session?.id);
      break;
    case 'viewing_session.annotation.converted':
      console.log('Annotation converted:', event.payload.viewing_session?.id);
      break;
    case 'live_event.registration':
      console.log('Live event registration:', event.payload.live_event?.id);
      // TODO: Add the registrant to your system
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// Wistia webhook endpoint - raw body so the exact bytes are verified, for any content type
app.post('/webhooks/wistia', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyWistiaSignature(rawBody, req.get('x-wistia-signature'), process.env.WISTIA_WEBHOOK_SECRET)) {
    console.error('Wistia webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after the signature check
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!body || !Array.isArray(body.events)) {
    return res.status(400).send('Missing events array');
  }

  // One POST can batch several events; each has its own uuid
  for (const event of body.events) {
    if (!event || typeof event !== 'object') continue;
    if (seenEventUuids.has(event.uuid)) continue;
    seenEventUuids.add(event.uuid);
    handleEvent(event);
  }

  res.json({ received: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Wistia webhook server listening on port ${port}`));
}

module.exports = { app, verifyWistiaSignature };
