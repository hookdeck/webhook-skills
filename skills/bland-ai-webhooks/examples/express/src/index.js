// Generated with: bland-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Bland signs deliveries with HMAC-SHA256:
//   X-Webhook-Signature: hex( HMAC-SHA256(signing secret, request body) )
// There is no timestamp or message id. Bland's docs sign JSON.stringify(req.body);
// signing the raw bytes is equivalent for the compact JSON Bland sends and
// is the safer choice because it doesn't depend on re-serialisation.
//
// The signing secret is created in Dev Portal > Account Settings > Keys
// ("Replace Secret"), shown once, and covers every webhook on the account.
// ---------------------------------------------------------------------------

/**
 * Verify X-Webhook-Signature against the raw request body.
 *
 * @param {Buffer|string} rawBody - the exact bytes Bland sent
 * @param {string|undefined} signature - value of X-Webhook-Signature
 * @param {string} secret - the account webhook signing secret
 * @returns {boolean}
 */
function verifyBlandSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.trim().toLowerCase(), 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false; // different lengths = invalid
  }
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The same call_id can legitimately arrive more than once (post-call, then
// citations / evals), so the key includes the payload's event_type.
const processedKeys = new Set();

function dedupeKey(payload) {
  const id = payload.call_id || payload.conversation_id;
  return id ? `${id}:${payload.event_type || payload.status || 'post_call'}` : null;
}

function handlePayload(payload) {
  // Bland doesn't send an event name on the standard post-call payload. Voice
  // calls carry call_id + status; enrichments add event_type; SMS carries
  // conversation_id. Ignore keys you don't recognise: payloads are additive.
  if (payload.conversation_id) {
    console.log(`SMS conversation ${payload.conversation_id} (${payload.status || 'message'})`);
    return;
  }

  switch (payload.event_type) {
    case 'citations':
      console.log(`Call ${payload.call_id}: ${(payload.citations || []).length} citations`);
      return;
    case 'post_transfer_transcript':
      console.log(`Call ${payload.call_id}: post-transfer transcript received`);
      return;
    case 'evals':
      console.log(`Call ${payload.call_id}: eval scores received`);
      return;
    case 'multiple':
      console.log(`Call ${payload.call_id}: combined payload (${(payload.contents || []).join(', ')})`);
      return;
    default:
      break;
  }

  // Standard post-call payload.
  if (payload.error_message) {
    // Call failures still arrive as a normal 200 delivery with the error in the payload.
    console.log(`Call ${payload.call_id} failed: ${payload.error_message}`);
  } else if (payload.status === 'completed') {
    const turns = Array.isArray(payload.transcripts) ? payload.transcripts.length : 0;
    console.log(`Call ${payload.call_id} completed (${payload.call_length} min, ${turns} transcript turns)`);
  } else {
    console.log(`Call ${payload.call_id} status: ${payload.status}`);
  }
}

// Bland webhook endpoint. express.raw({ type: '*/*' }) keeps the exact bytes for
// the HMAC whatever content type Bland sends; express.json() would re-serialise
// the body and can break verification.
app.post('/webhooks/bland-ai', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BLAND_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('BLAND_WEBHOOK_SECRET is not set, rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('x-webhook-signature');
  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Webhook-Signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!verifyBlandSignature(rawBody, signature, secret)) {
    console.error('Bland webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const key = dedupeKey(payload);
  if (key && processedKeys.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast and return 2xx; store or enqueue the payload and process it afterwards.
    handlePayload(payload);
    if (key) processedKeys.add(key);
  } catch (err) {
    console.error('Error handling Bland payload:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Bland AI webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/bland-ai`);
  });
}

module.exports = { app, server, verifyBlandSignature };
