// Generated with: zoom-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Zoom webhook signature.
 *
 * Zoom signs `v0:{timestamp}:{rawBody}` with HMAC-SHA256 keyed on the app's
 * Secret Token and sends it in the `x-zm-signature` header as `v0=<hex>`.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} timestamp - x-zm-request-timestamp header value
 * @param {string} signature - x-zm-signature header value (v0=<hex>)
 * @param {string} secretToken - Zoom app Secret Token
 * @returns {boolean} - Whether the signature is valid
 */
function verifyZoomWebhook(rawBody, timestamp, signature, secretToken) {
  if (!timestamp || !signature) {
    return false;
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const message = `v0:${timestamp}:${body}`;
  const expected =
    'v0=' + crypto.createHmac('sha256', secretToken).update(message).digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // Length mismatch = invalid
  }
}

/**
 * Build the response body for Zoom's one-time endpoint.url_validation challenge.
 * encryptedToken = HMAC-SHA256(plainToken, secretToken) as hex.
 */
function buildValidationResponse(plainToken, secretToken) {
  const encryptedToken = crypto
    .createHmac('sha256', secretToken)
    .update(plainToken)
    .digest('hex');
  return { plainToken, encryptedToken };
}

// Zoom webhook endpoint - must use raw body for signature verification
app.post(
  '/webhooks/zoom',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const signature = req.headers['x-zm-signature'];
    const timestamp = req.headers['x-zm-request-timestamp'];
    const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

    // Verify webhook signature
    if (!verifyZoomWebhook(req.body, timestamp, signature, secretToken)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload after verification
    const payload = JSON.parse(req.body.toString('utf8'));
    const event = payload.event;

    // Answer the one-time URL validation handshake
    if (event === 'endpoint.url_validation') {
      const response = buildValidationResponse(
        payload.payload.plainToken,
        secretToken
      );
      return res.status(200).json(response);
    }

    console.log(`Received ${event} event`);

    // Handle the event based on type
    const object = payload.payload?.object;
    switch (event) {
      case 'meeting.started':
        console.log(`Meeting started: ${object?.topic} (${object?.id})`);
        // TODO: Start recording bot, notify team, begin tracking, etc.
        break;

      case 'meeting.ended':
        console.log(`Meeting ended: ${object?.topic} (${object?.id})`);
        // TODO: Trigger follow-ups, compute duration, close sessions, etc.
        break;

      case 'meeting.participant_joined':
        console.log(
          `Participant joined ${object?.id}: ${object?.participant?.user_name}`
        );
        // TODO: Attendance tracking, greetings, presence updates, etc.
        break;

      case 'meeting.participant_left':
        console.log(
          `Participant left ${object?.id}: ${object?.participant?.user_name}`
        );
        // TODO: Attendance tracking, drop-off analytics, etc.
        break;

      case 'recording.completed':
        console.log(`Recording completed for meeting ${object?.id}`);
        // TODO: Download recording, transcribe, publish, notify, etc.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    // Return 200 to acknowledge receipt (within 3 seconds)
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyZoomWebhook, buildValidationResponse };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zoom`);
  });
}
