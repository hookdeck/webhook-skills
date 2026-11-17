require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// HIPAA deliveries older than this are rejected as replays
const HIPAA_MAX_AGE_SECONDS = 300;

/**
 * Timing-safe string comparison that returns false (instead of throwing)
 * when the lengths differ.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Chatbase event webhook signature.
 *
 * x-chatbase-signature = hex(HMAC-SHA1(secret, rawBody)) - no prefix, no timestamp.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - x-chatbase-signature header value
 * @param {string|undefined} secret - Webhook secret
 * @returns {boolean}
 */
function verifyChatbaseSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  return safeEqual(signature, expected);
}

/**
 * Verify a Chatbase HIPAA conversation webhook signature.
 *
 * X-Chatbase-Signature = "v1=" + hex(HMAC-SHA256(secret, timestamp + "." + rawBody))
 *
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function verifyChatbaseHipaaSignature(rawBody, signature, timestamp, secret, nowSeconds = Date.now() / 1000) {
  if (!signature || !timestamp) return { ok: false, error: 'missing_headers' };
  if (!secret) return { ok: false, error: 'invalid_signature' };

  // Replay protection: the timestamp is signed, but only checking it makes that useful
  const age = Math.abs(nowSeconds - Number(timestamp));
  if (!/^\d+$/.test(timestamp) || !Number.isFinite(age) || age > HIPAA_MAX_AGE_SECONDS) {
    return { ok: false, error: 'stale_timestamp' };
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.`);
  hmac.update(rawBody);
  const expected = `v1=${hmac.digest('hex')}`;

  // Compare the full string, v1= prefix included
  return safeEqual(signature, expected) ? { ok: true } : { ok: false, error: 'invalid_signature' };
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

function handleEvent(event) {
  const { eventType, chatbotId, payload = {} } = event;
  const { kind, actionName } = parseEventType(eventType);

  switch (kind) {
    case 'leads.submit':
      console.log(`New lead for agent ${chatbotId}: ${payload.customerName} <${payload.customerEmail}>`);
      // payload.customFields holds custom fields and UTM values when configured
      // TODO: Create the contact in your CRM
      break;
    case 'custom_form.submit':
      console.log(`Custom form "${actionName}" submitted in conversation ${payload.conversationId}`, payload.data);
      if (payload.error) console.warn(`Attachment upload failed: ${payload.error}`);
      // TODO: Store the submission
      break;
    case 'collect_data.submit':
      console.log(`Collect Data "${actionName}" submitted in conversation ${payload.conversationId}`, payload.customFields);
      // TODO: Store the collected fields
      break;
    case 'phone_call.summary':
      console.log(`Call from ${payload.callerNumber} to ${payload.calledNumber} (${payload.duration}s): ${payload.callSummary}`);
      // TODO: Log the call against the caller's record
      break;
    default:
      console.log(`Unhandled Chatbase event: ${eventType}`);
  }
  return kind;
}

// Chatbase event webhooks - raw body so the HMAC covers the exact bytes sent
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

// Chatbase HIPAA conversation webhook (Settings > HIPAA)
app.post('/webhooks/chatbase-hipaa', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CHATBASE_HIPAA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CHATBASE_HIPAA_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyChatbaseHipaaSignature(
    rawBody,
    req.get('x-chatbase-signature'),
    req.get('x-chatbase-timestamp'),
    secret
  );
  if (!result.ok) {
    // Any non-2xx works; Chatbase's endpoint check requires the forged probe to be rejected
    return res.status(400).json({ error: result.error });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Verification probes carry test: true - acknowledge, never store
  if (event.test) {
    return res.status(200).json({ received: true, test: true });
  }

  // Deduplicate on deliveryId (also in X-Chatbase-Delivery-Id): delivery is at-least-once
  if (event.event === 'conversation.deleted') {
    const { conversation = {} } = event;
    console.log(
      `Conversation ${conversation.id} (agent ${conversation.chatbotId}) deleted (${event.deletionReason}), ` +
        `${(conversation.messages || []).length} messages, delivery ${event.deliveryId}`
    );
    // TODO: Queue the conversation for storage; download attachment downloadUrls within 24 hours
  } else {
    console.log(`Unhandled Chatbase HIPAA event: ${event.event}`);
  }

  // Respond quickly - Chatbase times out after 10 seconds
  res.status(200).json({ received: true, event: event.event });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = {
  app,
  verifyChatbaseSignature,
  verifyChatbaseHipaaSignature,
  parseEventType,
};

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Event webhooks: POST http://localhost:${PORT}/webhooks/chatbase`);
    console.log(`HIPAA webhook:  POST http://localhost:${PORT}/webhooks/chatbase-hipaa`);
  });
}
