// Generated with: ably-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');
const { decode } = require('@msgpack/msgpack');

const app = express();

// Ably presence actions arrive as numbers in raw payloads
const PRESENCE_ACTIONS = { 0: 'absent', 1: 'present', 2: 'enter', 3: 'leave', 4: 'update' };

// The HMAC key is the keyValue: the part of "appId.keyId:keyValue" AFTER the ":".
// Using the whole API key as the HMAC key is the most common cause of failures.
function keyValueOf(apiKey) {
  const i = (apiKey || '').indexOf(':');
  return i === -1 ? null : apiKey.slice(i + 1);
}

// X-Ably-Key names the API key that signed the request ("appId.keyId")
function keyMatches(headerKey, apiKey) {
  if (!headerKey) return true;
  const id = apiKey.slice(0, apiKey.indexOf(':'));
  return headerKey === id || headerKey === id.split('.').pop();
}

function verifyAblySignature(rawBody, signature, apiKey) {
  const keyValue = keyValueOf(apiKey);
  if (!keyValue || !signature) return false;
  const expected = crypto.createHmac('sha256', keyValue).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Turn an Ably request into a flat list of events. Handles non-enveloped,
// enveloped and batched (items[]) requests.
function extractEvents(req, rawBody) {
  const h = req.headers;
  if (h['x-ably-envelope-source']) {
    // Non-enveloped: metadata is in unsigned x-ably-envelope-* headers, body is the raw data
    return [{
      source: h['x-ably-envelope-source'],
      channel: h['x-ably-envelope-channel'],
      name: h['x-ably-message-name'],
      data: rawBody.toString('utf8'),
    }];
  }
  const type = h['content-type'] || '';
  const payload = type.includes('msgpack') ? decode(rawBody) : JSON.parse(rawBody.toString('utf8'));
  if (Array.isArray(payload.items)) {
    return payload.items.map((item) => ({
      source: item.source,
      name: item.name,
      channel: item.data?.channelId,
      messages: item.data?.messages,
      presence: item.data?.presence,
      status: item.data?.status,
    }));
  }
  return [{
    source: payload.source,
    name: payload.name,
    channel: payload.channel,
    messages: payload.messages,
    presence: payload.presence,
    status: payload.status,
  }];
}

function handleEvent(event) {
  switch (event.source) {
    case 'channel.message':
      for (const m of event.messages || []) {
        console.log(`Message "${m.name}" on ${event.channel} from ${m.clientId ?? 'unknown'}`);
      }
      if (event.data !== undefined) console.log(`Message "${event.name}" on ${event.channel}`);
      break;
    case 'channel.presence':
      for (const p of event.presence || []) {
        console.log(`Presence ${PRESENCE_ACTIONS[p.action] ?? p.action}: ${p.clientId} on ${event.channel}`);
      }
      if (event.data !== undefined) console.log(`Presence ${event.name} on ${event.channel}`);
      break;
    case 'channel.lifecycle':
      // name is channel.opened or channel.closed
      console.log(`Channel lifecycle ${event.name} on ${event.channel}`);
      break;
    case 'channel.occupancy':
      console.log(`Occupancy changed on ${event.channel}`);
      break;
    default:
      console.log(`Unhandled Ably source: ${event.source}`);
  }
}

// Ably webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes for any
// content type (JSON, msgpack, text/plain, octet-stream), which the signature covers.
app.post('/webhooks/ably', express.raw({ type: '*/*' }), (req, res) => {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey || !keyValueOf(apiKey)) {
    return res.status(500).send('ABLY_API_KEY must be a full Ably API key (appId.keyId:keyValue)');
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).send('Missing body');
  }

  // Signing is opt-in on the rule ("Sign with key"); this handler requires it
  const signature = req.headers['x-ably-signature'];
  if (!signature) {
    return res.status(400).send('Missing X-Ably-Signature header');
  }
  if (!keyMatches(req.headers['x-ably-key'], apiKey)) {
    return res.status(400).send('Signed with a different API key');
  }
  if (!verifyAblySignature(req.body, signature, apiKey)) {
    console.error('Ably webhook verification failed');
    return res.status(400).send('Invalid signature');
  }

  let events;
  try {
    events = extractEvents(req, req.body);
  } catch {
    return res.status(400).send('Invalid payload');
  }

  for (const event of events) handleEvent(event);
  res.json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Ably webhook server listening on http://localhost:${port}`);
    console.log(`Webhook endpoint: POST http://localhost:${port}/webhooks/ably`);
  });
}

module.exports = app;
