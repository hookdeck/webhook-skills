require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// x-chatbase-signature is 40 hex characters: hex(HMAC-SHA1(secret, rawBody))
const SIGNATURE_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Verify a Chatbase Action webhook signature.
 *
 * x-chatbase-signature = hex(HMAC-SHA1(secret, rawBody)) - no prefix, no timestamp.
 * The value must be exactly 40 hex characters. Hex is compared case-insensitively,
 * in constant time.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - x-chatbase-signature header value
 * @param {string|undefined} secret - Webhook secret
 * @returns {boolean}
 */
function verifyChatbaseSignature(rawBody, signature, secret) {
  if (!signature || !secret || !SIGNATURE_PATTERN.test(signature)) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature.toLowerCase(), 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  return received.length === computed.length && crypto.timingSafeEqual(received, computed);
}

/**
 * Event types with an Action name in them look like
 * "{action name}_custom_form.submit" and "{action name}_collect_data.submit".
 */
function parseEventType(eventType) {
  if (eventType === 'leads.submit' || eventType === 'phone_call.summary') {
    return { kind: eventType };
  }
  for (const suffix of ['_custom_form.submit', '_collect_data.submit']) {
    if (typeof eventType === 'string' && eventType.endsWith(suffix) && eventType.length > suffix.length) {
      return { kind: suffix.slice(1), actionName: eventType.slice(0, -suffix.length) };
    }
  }
  return { kind: 'unknown' };
}

// Payloads carry names, emails, phone numbers and call summaries: log ids only.
function handleEvent(event) {
  const { eventType, chatbotId, payload = {} } = event;
  const { kind, actionName } = parseEventType(eventType);

  switch (kind) {
    case 'leads.submit':
      console.log(`leads.submit for agent ${chatbotId}, conversation ${payload.conversationId}`);
      // Your code: create or update the contact in your CRM.
      // payload.customFields holds custom fields and UTM values when configured.
      break;
    case 'custom_form.submit':
      console.log(`Custom form "${actionName}" submitted in conversation ${payload.conversationId}`);
      if (payload.error) console.warn(`Custom form "${actionName}": attachment upload failed`);
      // Your code: store payload.data, the submitted fields keyed by field name.
      break;
    case 'collect_data.submit':
      console.log(`Collect Data "${actionName}" submitted in conversation ${payload.conversationId}`);
      // Your code: store payload.customFields.
      break;
    case 'phone_call.summary':
      console.log(`phone_call.summary for conversation ${payload.conversationId} (${payload.duration}s)`);
      // Your code: attach payload.callSummary to the caller's record.
      break;
    default:
      console.log(`Unhandled Chatbase event: ${eventType}`);
  }
  return kind;
}

// Chatbase Action webhooks - raw body so the HMAC covers the exact bytes sent
app.post('/webhooks/chatbase', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CHATBASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHATBASE_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('x-chatbase-signature');
  if (!signature) {
    return res.status(400).json({ error: 'Missing x-chatbase-signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyChatbaseSignature(rawBody, signature, secret)) {
    console.error('Chatbase webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const kind = handleEvent(event);
  res.status(200).json({ received: true, eventType: event.eventType, kind });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = {
  app,
  verifyChatbaseSignature,
  parseEventType,
};

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/chatbase`);
  });
}
