// Generated with: bunny-stream-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Human-readable names for Bunny Stream's numeric Status enum.
const STATUS = {
  0: 'Queued',
  1: 'Processing',
  2: 'Encoding',
  3: 'Finished',
  4: 'Resolution finished',
  5: 'Failed',
  6: 'PresignedUploadStarted',
  7: 'PresignedUploadFinished',
  8: 'PresignedUploadFailed',
  9: 'CaptionsGenerated',
  10: 'TitleOrDescriptionGenerated',
  11: 'CaptionGenerationFailed',
  12: 'ChaptersGenerated',
  13: 'MomentsGenerated',
  32: 'VideoDeleted',
  33: 'SmartGenerationFailed',
};

/**
 * Verify a Bunny Stream webhook signature.
 *
 * Bunny signs the EXACT raw request body with HMAC-SHA256, keyed on the video
 * library's Read-Only API key, and sends the digest as lowercase hex in
 * X-BunnyStream-Signature. Verify against the raw (unparsed) body.
 *
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-BunnyStream-Signature header value
 * @param {string} secret - Library Read-Only API key
 * @returns {boolean}
 */
function verifyBunnyStream(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guard against malformed/wrong-length hex.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// Bunny Stream webhook endpoint - must use raw body for signature verification
app.post('/webhooks/bunny-stream',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-bunnystream-signature'];

    // Verify webhook signature against the raw body BEFORE parsing.
    if (!verifyBunnyStream(req.body, signature, process.env.BUNNY_STREAM_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification. Bunny's payload is thin:
    // { IsLiveStreamWebhook, VideoLibraryId, VideoGuid, Status, EventId, Timestamp }
    // plus Reason on SmartGenerationFailed. Deduplicate on EventId, which
    // stays the same on retries.
    const { VideoLibraryId, VideoGuid, Status } = JSON.parse(req.body.toString());

    console.log(
      `Video ${VideoGuid} (library ${VideoLibraryId}) -> ` +
      `${STATUS[Status] || 'Unknown'} (Status ${Status})`
    );

    // The event type IS the numeric Status. Dispatch on it.
    switch (Status) {
      case 3: // Finished - encoding done, video is ready to play
        console.log(`Encoding finished for ${VideoGuid}`);
        // Your code: publish the video, notify users, fetch full metadata via the
        // Stream API: GET /library/{VideoLibraryId}/videos/{VideoGuid}
        break;

      case 5: // Failed - encoding failed
        console.error(`Encoding failed for ${VideoGuid}`);
        // Your code: alert, mark failed, offer re-upload
        break;

      case 9: // CaptionsGenerated
        console.log(`Captions generated for ${VideoGuid}`);
        // Your code: enable captions, index transcript
        break;

      case 10: // TitleOrDescriptionGenerated
        console.log(`AI title/description generated for ${VideoGuid}`);
        // Your code: populate metadata fields
        break;

      default:
        // 0 Queued, 1 Processing, 2 Encoding, 4 Resolution finished,
        // 6-8 presigned upload lifecycle, 11-13 and 32-33
        console.log(`Unhandled status: ${Status}`);
    }

    // Return 200 to acknowledge receipt.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyBunnyStream };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bunny-stream`);
  });
}
