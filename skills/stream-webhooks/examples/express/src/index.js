// Generated with: stream-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');

const app = express();

const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

/**
 * Stream signs the UNCOMPRESSED body. If Payload Compression
 * (enable_hook_payload_compression) is on and nothing upstream decompressed
 * the request, gunzip before verifying. Turn compression off when using Hookdeck.
 */
function decodeBody(rawBody) {
  if (rawBody.length >= 2 && rawBody.subarray(0, 2).equals(GZIP_MAGIC)) {
    return zlib.gunzipSync(rawBody);
  }
  return rawBody;
}

/**
 * Verify a Stream webhook signature.
 * @param {Buffer|string} rawBody - Raw (uncompressed) request body
 * @param {string} signature - X-Signature header (hex HMAC-SHA256)
 * @param {string} apiSecret - Stream app API secret
 * @returns {boolean}
 */
function verifyStreamWebhook(rawBody, signature, apiSecret) {
  if (!signature || !apiSecret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws if lengths differ
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// express.raw with type '*/*' keeps the body as a Buffer whatever the Content-Type is
app.post('/webhooks/stream', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-signature'];
  const webhookId = req.headers['x-webhook-id'];
  const apiKey = req.headers['x-api-key'];

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).send('Missing body');
  }

  let body;
  try {
    body = decodeBody(req.body);
  } catch {
    return res.status(400).send('Invalid body encoding');
  }

  if (!verifyStreamWebhook(body, signature, process.env.STREAM_API_SECRET)) {
    console.error('Stream webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Optional sanity check that the call is for your app
  if (process.env.STREAM_API_KEY && apiKey !== process.env.STREAM_API_KEY) {
    return res.status(400).send('Unexpected API key');
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // X-Webhook-Id is stable across retries: use it to dedupe
  console.log(`Received ${event.type} (webhook id: ${webhookId})`);

  switch (event.type) {
    case 'message.new':
      console.log(`New message in ${event.cid}:`, event.message?.text);
      break;
    case 'message.updated':
      console.log(`Message updated: ${event.message?.id}`);
      break;
    case 'message.deleted':
      console.log(`Message deleted: ${event.message?.id}`);
      break;
    case 'reaction.new':
      console.log(`Reaction ${event.reaction?.type} on ${event.message?.id}`);
      break;
    case 'channel.created':
      console.log(`Channel created: ${event.cid}`);
      break;
    case 'user.updated':
      console.log(`User updated: ${event.user?.id}`);
      break;
    case 'member.added':
      console.log(`Member added: ${event.member?.user_id} to ${event.cid}`);
      break;
    default:
      // Stream adds event types over time; don't fail on unknown ones
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Stream webhook server listening on http://localhost:${port}`);
  });
}

module.exports = { app, verifyStreamWebhook, decodeBody };
