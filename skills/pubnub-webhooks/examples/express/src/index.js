// Generated with: pubnub-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const SCHEMA_PREFIX = 'pubnub.com/schemas/events/';

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * PubNub does not sign webhooks. You add a secret custom header to the Webhook
 * action; its name is yours to choose (PUBNUB_WEBHOOK_HEADER, default
 * 'Authorization') and the expected value is the WHOLE header value
 * (PUBNUB_WEBHOOK_SECRET), including any 'Bearer ' prefix you typed. Nothing
 * is stripped or parsed. Node lowercases incoming header names.
 */
function verifyPubNubRequest(
  headers,
  secret = process.env.PUBNUB_WEBHOOK_SECRET,
  headerName = process.env.PUBNUB_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

/** 'pubnub.com/schemas/events/user.created?v=1.0.0' -> 'user.created' */
function eventTypeFromSchema(dataSchema) {
  if (typeof dataSchema !== 'string') return null;
  const withoutVersion = dataSchema.split('?')[0];
  return withoutVersion.startsWith(SCHEMA_PREFIX) ? withoutVersion.slice(SCHEMA_PREFIX.length) : null;
}

// Each item in payload.data is one event of the type named by payload.dataSchema.
function handleItem(type, item) {
  switch (type) {
    case 'messages.pubsub.publish':
      // Also used for File sent: those items carry fileId and fileName.
      console.log(`Message on ${item.channel} from ${item.senderId}`);
      // TODO: process item.message (item.timetoken is the dedupe key)
      break;

    case 'messages.action.created':
      console.log(`Message action added on ${item.channel} by ${item.userId}`);
      break;

    case 'messages.action.deleted':
      console.log(`Message action removed on ${item.channel} by ${item.userId}`);
      break;

    case 'presence.user.channel.joined':
      console.log(`${item.userId} joined ${item.channel} (occupancy ${item.occupancy})`);
      break;

    case 'presence.user.channel.left':
      console.log(`${item.userId} left ${item.channel} (occupancy ${item.occupancy})`);
      break;

    case 'presence.user.timedout.in.channel':
      console.log(`${item.userId} timed out in ${item.channelId}`);
      break;

    case 'presence.channel.user.state.in.changed':
      console.log(`${item.userId} changed state in ${item.channel}`);
      break;

    case 'presence.channel.state.active':
      console.log(`First user subscribed to ${item.channel}`);
      break;

    case 'presence.channel.state.inactive':
      console.log(`Last user left ${item.channel}`);
      break;

    case 'presence.channel.occupancy.counted':
      console.log(`Occupancy of ${item.channel}: ${item.occupancy}`);
      break;

    case 'user.created':
      console.log(`User created: ${item.userId}`);
      // TODO: provision the user in your system
      break;

    case 'user.updated':
      console.log(`User updated: ${item.userId}`);
      break;

    case 'user.deleted':
      console.log(`User deleted: ${item.userId}`);
      break;

    case 'channel.created':
      console.log(`Channel created: ${item.channelId}`);
      break;

    case 'channel.updated':
      console.log(`Channel updated: ${item.channelId}`);
      break;

    case 'channel.deleted':
      console.log(`Channel deleted: ${item.channelId}`);
      break;

    case 'membership.created':
      console.log(`Membership created: ${item.userId} in ${item.channelId}`);
      break;

    case 'membership.updated':
      console.log(`Membership updated: ${item.userId} in ${item.channelId}`);
      break;

    case 'membership.deleted':
      console.log(`Membership deleted: ${item.userId} in ${item.channelId}`);
      break;

    case 'push.device.removed':
      console.log(`Push device removed: ${item.device}`);
      break;

    case 'push.message.sending.failed':
      console.log(`Push failed on ${item.channel}: ${item.payload}`);
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/pubnub', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPubNubRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const type = payload && typeof payload === 'object' ? eventTypeFromSchema(payload.dataSchema) : null;
  if (!type || !Array.isArray(payload.data)) {
    return res.status(400).json({ error: 'Expected a No Envelope payload with dataSchema and data' });
  }

  try {
    for (const item of payload.data) handleItem(type, item || {});
  } catch (err) {
    console.error('Error handling PubNub event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPubNubRequest = verifyPubNubRequest;
module.exports.eventTypeFromSchema = eventTypeFromSchema;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pubnub`);
  });
}
