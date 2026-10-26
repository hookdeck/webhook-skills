// Generated with: 360dialog-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison of two byte strings. Hashing both sides first gives
 * equal-length buffers, so timingSafeEqual never throws and length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse `Authorization: Basic base64(username:password)`. The scheme is
 * case-insensitive and the value is split on the FIRST colon (passwords may
 * contain ':'). Returns null when the header is missing or malformed.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  const i = decoded.indexOf(0x3a); // ':'
  if (i === -1) return null;
  return { username: decoded.subarray(0, i), password: decoded.subarray(i + 1) };
}

/**
 * 360dialog does not sign webhooks. You set `Authorization: Basic base64(USER:PASS)` in the
 * `headers` object when setting the webhook URL, and 360dialog sends it with every request.
 * Compare username and password separately, evaluating both before deciding.
 */
function verify360dialogRequest(headers, config = process.env) {
  const username = config.THREE_SIXTY_DIALOG_WEBHOOK_USERNAME;
  const password = config.THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD;
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers['authorization']);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(username));
  const passOk = safeEqual(creds.password, Buffer.from(password));
  return userOk && passOk;
}

/**
 * Flatten a 360dialog (WhatsApp Cloud API) body into a list of events.
 *   - Meta format: entry[].changes[] with a `field`. `messages` carries value.messages
 *     (inbound), value.statuses (delivery updates) or value.errors; Coexistence adds the
 *     `smb_message_echoes`, `history` and `smb_app_state_sync` fields.
 *   - Envelope format: {id, event, data}, used in the docs for history and smb_app_state_sync.
 */
function extractEvents(payload) {
  const events = [];

  if (Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      for (const change of (entry && entry.changes) || []) {
        const field = change.field;
        const value = change.value || {};
        if (field === 'messages') {
          for (const message of value.messages || []) events.push({ kind: 'message', value, message });
          for (const status of value.statuses || []) events.push({ kind: 'status', value, status });
          for (const error of value.errors || []) events.push({ kind: 'error', value, error });
        } else {
          events.push({ kind: field || 'unknown', value });
        }
      }
    }
  } else if (typeof payload.event === 'string') {
    events.push({ kind: payload.event, value: payload.data || {} });
  }

  return events;
}

function handleEvent(event) {
  switch (event.kind) {
    case 'message': {
      const m = event.message;
      // m.type: text, image, video, audio, document, sticker, location, contacts, reaction,
      // interactive, button, order, system, unsupported, ...
      console.log(`Inbound ${m.type} message ${m.id} from ${m.from}`);
      // TODO: process the inbound message (acknowledge fast, do real work asynchronously)
      break;
    }

    case 'status': {
      const s = event.status;
      // s.status: sent, delivered, read, failed, played
      console.log(`Message ${s.id} to ${s.recipient_id}: ${s.status}`);
      // TODO: update delivery state (log s.errors when status is failed)
      break;
    }

    case 'error':
      console.log(`Operational error ${event.error.code}: ${event.error.title}`);
      break;

    case 'smb_message_echoes':
      console.log(`Echoed ${(event.value.message_echoes || []).length} message(s) sent from the WhatsApp Business app`);
      // TODO: record messages the business sent from the app (Coexistence)
      break;

    case 'history':
      console.log('Chat history sync event');
      // TODO: store history chunks (Coexistence)
      break;

    case 'smb_app_state_sync':
      console.log(`Contact state sync: ${(event.value.state_sync || []).length} change(s)`);
      // TODO: sync contacts (Coexistence)
      break;

    default:
      console.log(`Unhandled 360dialog event: ${event.kind}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type the request carries.
app.post('/webhooks/360dialog', express.raw({ type: '*/*' }), (req, res) => {
  const configured =
    process.env.THREE_SIXTY_DIALOG_WEBHOOK_USERNAME && process.env.THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD;
  if (!configured) {
    console.error('Set THREE_SIXTY_DIALOG_WEBHOOK_USERNAME and THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD');
    return res.status(500).json({ error: 'Webhook authentication not configured' });
  }

  if (!verify360dialogRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    for (const event of extractEvents(payload)) handleEvent(event);
  } catch (err) {
    console.error('Error handling 360dialog webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // 360dialog needs a 200 within 5 seconds, otherwise it retries
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verify360dialogRequest = verify360dialogRequest;
module.exports.parseBasicAuth = parseBasicAuth;
module.exports.extractEvents = extractEvents;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/360dialog`);
  });
}
