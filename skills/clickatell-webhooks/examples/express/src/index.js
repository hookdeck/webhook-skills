// Generated with: clickatell-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Clickatell One API callbacks are unsigned. Authenticate with the Custom Security Header you
 * added to the callback URL: the header name is yours (CLICKATELL_WEBHOOK_HEADER, default
 * Authorization) and the expected value is the exact, whole header value, including any
 * "Bearer " prefix. No prefix parsing.
 */
function verifyClickatellRequest(headers, {
  name = process.env.CLICKATELL_WEBHOOK_HEADER || 'Authorization',
  expected = process.env.CLICKATELL_WEBHOOK_SECRET,
} = {}) {
  if (!expected) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on unequal lengths, so check them first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// One handler per event kind: the name of the key inside `event`. Each value is an array.
const handlers = {
  messageStatusUpdate: (e) => {
    console.log(`Message ${e.messageId} status: ${e.status} (${e.statusCode})`);
    // TODO: update delivery state; events can repeat or arrive out of order (use e.timestamp)
  },
  messageFallback: (e) => {
    console.log(`Message ${e.messageId} fallback: ${e.status}`);
    // TODO: record the channel fallback
  },
  statusIsTyping: (e) => {
    console.log(`${e.from} is typing`);
    // TODO: show a typing indicator
  },
  moText: (e) => {
    console.log(`Text from ${e.from}: ${e.content}`);
    // TODO: route to your bot or inbox
  },
  moMedia: (e) => {
    console.log(`Media from ${e.from}: ${e.contentType || (e.files && e.files[0] && e.files[0].contentType)}`);
    // TODO: download e.files[].downloadUrl and store it
  },
  moLocation: (e) => {
    console.log(`Location from ${e.from}: ${e.locationName}`);
    // TODO: use e.latitute / e.longitude (the docs spell it "latitute")
  },
  moContacts: (e) => {
    console.log(`Contacts from ${e.from}: ${(e.contacts || []).length}`);
    // TODO: import e.contacts
  },
  moSuggestedResponse: (e) => {
    console.log(`Suggested response from ${e.from}: ${e.postbackData}`);
    // TODO: continue the flow using e.postbackData
  },
  moListPickerResponse: (e) => {
    console.log(`List selection from ${e.from}`);
    // TODO: continue the flow using e.selectedItems
  },
  moButtonResponse: (e) => {
    console.log(`Button response from ${e.from}`);
    // TODO: continue the flow using e.selectedItem
  },
};

function handleEvent(payload) {
  for (const [kind, events] of Object.entries(payload.event)) {
    const handler = handlers[kind];
    if (!handler) {
      console.log(`Unhandled event: ${kind}`);
      continue;
    }
    for (const e of Array.isArray(events) ? events : []) handler(e);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/clickatell', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyClickatellRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing security header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || !payload.event || typeof payload.event !== 'object' || Array.isArray(payload.event)) {
    return res.status(400).json({ error: 'Expected a JSON object with an event object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Clickatell event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyClickatellRequest = verifyClickatellRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/clickatell`);
  });
}
