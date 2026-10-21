// Generated with: recall-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Standard Webhooks recommends rejecting timestamps more than 5 minutes off.
// Recall.ai's own sample doesn't enforce a window; pass 0 to disable it.
const TOLERANCE_SECONDS = 300;

/**
 * Pick the header set Recall.ai sent.
 *
 * Workspace verification secret -> webhook-id / webhook-timestamp / webhook-signature
 * Legacy Svix endpoint secret (accounts created before 2025-12-15) -> svix-*
 */
function getSignatureHeaders(headers) {
  const prefix = headers['webhook-signature'] !== undefined ? 'webhook' : 'svix';
  return {
    id: headers[`${prefix}-id`],
    timestamp: headers[`${prefix}-timestamp`],
    signature: headers[`${prefix}-signature`],
  };
}

/**
 * Verify a Recall.ai webhook (Standard Webhooks / Svix scheme).
 *
 * Signed content: `${id}.${timestamp}.${rawBody}` (raw bytes, not re-serialised JSON)
 * Key:            base64-decoded part of the secret after `whsec_`
 * Algorithm:      HMAC-SHA256, base64 digest
 * Header:         space-delimited list of `v1,<base64>` (several during secret rotation)
 */
function verifyRecallSignature(
  rawBody,
  headers,
  secret,
  toleranceSeconds = TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!secret || !secret.startsWith('whsec_')) {
    return { valid: false, error: 'Verification secret is missing or not whsec_-prefixed' };
  }

  const { id, timestamp, signature } = getSignatureHeaders(headers);
  if (!id || !timestamp || !signature) {
    return { valid: false, error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' };
  }

  if (!/^[0-9]+$/.test(timestamp)) {
    return { valid: false, error: 'Invalid timestamp' };
  }
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();

  // Accept if ANY v1 signature matches (Recall sends one per active secret after a rotation)
  const matched = signature.split(' ').some((versioned) => {
    const [version, sig] = versioned.split(',');
    if (version !== 'v1' || !sig) return false;
    const sigBytes = Buffer.from(sig, 'base64');
    return sigBytes.length === expected.length && crypto.timingSafeEqual(sigBytes, expected);
  });

  return matched ? { valid: true } : { valid: false, error: 'No matching signature found' };
}

function handleEvent(event) {
  const data = event.data || {};

  switch (event.event) {
    // Bot status change (Svix webhooks)
    case 'bot.joining_call':
    case 'bot.in_waiting_room':
    case 'bot.in_call_not_recording':
    case 'bot.in_call_recording':
    case 'bot.call_ended':
      console.log(`Bot ${data.bot?.id} status: ${data.data?.code}`);
      break;
    case 'bot.done':
      // Media is uploaded and ready to download if the bot recorded
      console.log(`Bot ${data.bot?.id} done`);
      break;
    case 'bot.fatal':
      console.log(`Bot ${data.bot?.id} fatal: ${data.data?.sub_code}`);
      break;

    // Recording and media artifact status (Svix webhooks)
    case 'recording.done':
      console.log(`Recording ${data.recording?.id} done`);
      break;
    case 'recording.failed':
      console.log(`Recording ${data.recording?.id} failed: ${data.data?.sub_code}`);
      break;
    case 'transcript.done':
      // Fetch the transcript via the API using data.transcript.id
      console.log(`Transcript ${data.transcript?.id} done`);
      break;
    case 'transcript.failed':
      console.log(`Transcript ${data.transcript?.id} failed: ${data.data?.sub_code}`);
      break;

    // Calendar V2 (Svix webhooks)
    case 'calendar.update':
      console.log(`Calendar ${data.calendar_id} updated; re-fetch it`);
      break;
    case 'calendar.sync_events':
      console.log(`Calendar ${data.calendar_id} events changed since ${data.last_updated_ts}`);
      break;

    // Real-time endpoint events (configured per bot in recording_config)
    case 'participant_events.join':
    case 'participant_events.leave':
      console.log(`${event.event}: ${data.data?.participant?.name}`);
      break;
    case 'transcript.data':
      console.log('Transcript utterance received for bot', data.bot?.id);
      break;

    default:
      console.log('Unhandled Recall.ai event:', event.event);
  }
}

// CRITICAL: express.raw() keeps the exact bytes Recall.ai signed
app.post('/webhooks/recall-ai', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const result = verifyRecallSignature(rawBody, req.headers, process.env.RECALL_WEBHOOK_SECRET);
  if (!result.valid) {
    console.error('Recall.ai webhook verification failed:', result.error);
    return res.status(400).json({ error: result.error });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // webhook-id (or svix-id) is stable across retries: use it as the idempotency key.
  // In production: persist the event, return 2xx within 15s, process async.
  const { id } = getSignatureHeaders(req.headers);
  console.log('Recall.ai event', id, event.event);
  handleEvent(event);

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRecallSignature = verifyRecallSignature;
module.exports.getSignatureHeaders = getSignatureHeaders;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/recall-ai`);
  });
}
