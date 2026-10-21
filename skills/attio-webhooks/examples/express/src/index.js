// Generated with: attio-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Idempotency-Key values already processed. In-memory for the example only:
// use a durable store (DB unique constraint, Redis SET NX) in production.
const processedKeys = new Set();

/**
 * Verify an Attio webhook signature.
 * Attio-Signature = hex(HMAC-SHA256(webhook_secret, raw_body)), no prefix or timestamp.
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - Attio-Signature (or X-Attio-Signature) header value
 * @param {string|undefined} secret - Webhook secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyAttioSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  // Reject anything that isn't a 64-char hex digest (timingSafeEqual throws on length mismatch)
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature.toLowerCase(), 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/**
 * Handle a single Attio event. Payloads contain IDs only; fetch full data
 * from the Attio REST API if you need it.
 */
function handleEvent(event) {
  const { event_type: eventType, id = {} } = event;

  switch (eventType) {
    case 'record.created':
      console.log(`Record created: ${id.record_id} (object ${id.object_id})`);
      // TODO: Sync the new record to your system
      break;

    case 'record.updated':
      console.log(`Record updated: ${id.record_id} (attribute ${id.attribute_id})`);
      // TODO: Fetch the record and sync the changed attribute
      break;

    case 'record.deleted':
      console.log(`Record deleted: ${id.record_id}`);
      // TODO: Remove the record downstream
      break;

    case 'record.merged':
      console.log(`Record ${event.duplicate_record_id} merged into ${id.record_id}`);
      // TODO: Re-point references to the merged record
      break;

    case 'list-entry.created':
      console.log(`List entry created: ${id.entry_id} in list ${id.list_id}`);
      // TODO: Start pipeline automation
      break;

    case 'list-entry.updated':
      console.log(`List entry updated: ${id.entry_id} (attribute ${id.attribute_id})`);
      // TODO: React to stage/status changes
      break;

    case 'list-entry.deleted':
      console.log(`List entry deleted: ${id.entry_id} from list ${id.list_id}`);
      // TODO: Clean up pipeline state
      break;

    case 'note.created':
      console.log(`Note created: ${id.note_id} on record ${event.parent_record_id}`);
      // TODO: Mirror the note
      break;

    case 'task.created':
      console.log(`Task created: ${id.task_id}`);
      // TODO: Create a ticket or reminder
      break;

    case 'comment.created':
      console.log(`Comment created: ${id.comment_id} in thread ${event.thread_id}`);
      // TODO: Notify a channel
      break;

    default:
      console.log(`Unhandled Attio event: ${eventType}`);
  }
}

// Attio webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/attio', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ATTIO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ATTIO_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  // Attio sends the same value in both headers; X-Attio-Signature is for legacy middleware
  const signature = req.get('attio-signature') ?? req.get('x-attio-signature');
  if (!signature) {
    return res.status(400).send('Missing signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyAttioSignature(rawBody, signature, secret)) {
    console.error('Attio webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Idempotency-Key is stable across retries and redeliveries
  const idempotencyKey = req.get('idempotency-key');
  if (idempotencyKey && processedKeys.has(idempotencyKey)) {
    console.log(`Duplicate delivery ${idempotencyKey}, skipping`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // Each delivery currently holds one event, but Attio may batch in future
  const events = Array.isArray(payload.events) ? payload.events : [];
  console.log(`Received ${events.length} event(s) from webhook ${payload.webhook_id}`);

  try {
    events.forEach(handleEvent);
  } catch (err) {
    console.error('Error handling Attio webhook:', err);
    // Non-2xx makes Attio retry (up to 10 times over ~3 days)
    return res.status(500).send('Handler error');
  }

  if (idempotencyKey) {
    processedKeys.add(idempotencyKey);
  }

  // Respond within 5 seconds with any 2xx
  res.status(200).json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyAttioSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/attio`);
  });
}
