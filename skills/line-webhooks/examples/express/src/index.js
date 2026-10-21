// Generated with: line-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const { validateSignature } = require('@line/bot-sdk');

const app = express();

/**
 * Verify a LINE webhook signature.
 *
 * LINE signs the raw request body with HMAC-SHA256 keyed on the channel secret
 * and sends the base64 digest in the x-line-signature header. The SDK's
 * validateSignature recomputes the digest and compares it timing-safe.
 *
 * @param {Buffer} rawBody - Raw request body, exactly as received
 * @param {string} signature - x-line-signature header value
 * @param {string} channelSecret - Channel secret from the LINE Developers Console
 * @returns {boolean} Whether the signature is valid
 */
function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  try {
    return validateSignature(rawBody, channelSecret, signature);
  } catch {
    return false;
  }
}

/**
 * Handle a single LINE webhook event object.
 * LINE batches events: one request carries an `events` array.
 */
function handleEvent(event) {
  switch (event.type) {
    case 'message':
      // message.type: text, image, video, audio, file, location, sticker
      console.log(`Message (${event.message.type}) from ${event.source?.userId}:`, event.message.text ?? event.message.id);
      // TODO: Reply with event.replyToken via the Messaging API reply endpoint
      break;

    case 'messageEdited':
      console.log('Message edited:', event.message.id);
      // TODO: Update the stored copy of the message (latest timestamp wins)
      break;

    case 'unsend':
      console.log('Message unsent:', event.unsend.messageId);
      // TODO: Delete the stored message so it can't be seen or used again
      break;

    case 'follow':
      console.log(`Followed by ${event.source?.userId} (unblocked: ${event.follow?.isUnblocked})`);
      // TODO: Send a welcome message, create the user record
      break;

    case 'unfollow':
      console.log(`Blocked by ${event.source?.userId}`);
      // TODO: Stop messaging this user
      break;

    case 'join':
      console.log(`Joined ${event.source?.type}:`, event.source?.groupId ?? event.source?.roomId);
      break;

    case 'leave':
      console.log(`Left ${event.source?.type}:`, event.source?.groupId ?? event.source?.roomId);
      break;

    case 'memberJoined':
      console.log('Members joined:', event.joined.members.map((m) => m.userId));
      break;

    case 'memberLeft':
      console.log('Members left:', event.left.members.map((m) => m.userId));
      break;

    case 'postback':
      console.log('Postback:', event.postback.data);
      // TODO: Route on postback.data (and postback.params for date/time pickers)
      break;

    case 'videoPlayComplete':
      console.log('Video watched:', event.videoPlayComplete.trackingId);
      break;

    case 'beacon':
      console.log(`Beacon ${event.beacon.type}:`, event.beacon.hwid);
      break;

    case 'accountLink':
      console.log(`Account link ${event.link.result}, nonce:`, event.link.nonce);
      // TODO: Look up the nonce and link accounts if result === 'ok'
      break;

    case 'membership':
      console.log(`Membership ${event.membership.type}:`, event.membership.membershipId);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// LINE webhook endpoint - express.raw keeps the body as a Buffer for verification
app.post('/webhooks/line', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-line-signature'];

  if (!signature) {
    return res.status(400).send('Missing x-line-signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Verify BEFORE parsing - never verify a re-serialized body
  if (!verifyLineSignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    console.error('LINE webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const events = Array.isArray(payload.events) ? payload.events : [];

  // The console "Verify" button sends {"destination": "...", "events": []} - acknowledge it
  if (events.length === 0) {
    console.log(`Webhook verification request for ${payload.destination}`);
    return res.status(200).send('OK');
  }

  for (const event of events) {
    if (event.deliveryContext?.isRedelivery) {
      // Redelivered events keep the same webhookEventId - dedupe on it
      console.log('Redelivered event:', event.webhookEventId);
    }
    handleEvent(event);
  }

  // Return 2xx quickly; LINE redelivers (if enabled) only on non-2xx responses
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyLineSignature, handleEvent };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/line`);
  });
}
