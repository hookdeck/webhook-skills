// Generated with: stedi-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Stedi event destinations follow the Standard Webhooks specification:
//   webhook-id         unique message ID, "msg_{UUID}" (stable across retries)
//   webhook-timestamp  Unix seconds when Stedi CREATED the event (not delivered)
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list during rotation)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the destination's secret after its `whsec_` prefix.
// (Stedi's docs describe the signed payload as "timestamp.body"; the
// Standard Webhooks spec and the standardwebhooks library include the id.)
// ---------------------------------------------------------------------------

/**
 * Verify a Stedi delivery manually. The standardwebhooks library would also
 * work, but it hard-codes a 5-minute timestamp window. Stedi retries for up to
 * 48 hours with the original creation timestamp, so every retry would be
 * rejected. Here the window is optional.
 *
 * @param {string|Buffer} rawBody - the exact body Stedi sent
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the destination's whsec_ signing secret
 * @param {number} toleranceSeconds - 0 disables the timestamp check
 * @returns {boolean}
 */
function verifyStediWebhook(rawBody, headers, secret, toleranceSeconds = 0) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader || !secret) return false;

  if (toleranceSeconds > 0) {
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest('base64');

  // Several "v1,<sig>" entries are present while a rotated secret is still valid.
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    try {
      const received = Buffer.from(sig);
      return received.length === expected.length && crypto.timingSafeEqual(received, Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Stedi recommends deduping on the webhook-id header.
const processedMessageIds = new Set();

// Stedi events are "thin": they say what changed, not the new state. Fetch the
// resource through the Stedi API before acting on it.
function handleEvent(event) {
  const { type, resource = {}, relatedResources = [] } = event;

  switch (type) {
    case 'event.ping':
      console.log(`Ping from destination ${resource.id}`);
      break;

    // --- Transaction enrollment -------------------------------------------
    case 'enrollment.activated':
      console.log(`Enrollment ${resource.id} is LIVE`);
      break;
    case 'enrollment.rejected':
      console.log(`Enrollment ${resource.id} was rejected by the payer`);
      break;
    case 'enrollment.updated':
      console.log(`Enrollment ${resource.id} changed`);
      break;
    case 'enrollment.task.assigned':
    case 'enrollment.task.completed':
    case 'enrollment.task.deleted': {
      const enrollment = relatedResources.find((r) => r.type === 'enrollment');
      console.log(`${type}: task ${resource.id} (enrollment ${enrollment?.id})`);
      break;
    }

    // --- File processing ----------------------------------------------------
    case 'file.processed':
      console.log(`File processed: execution ${resource.id}`);
      break;
    case 'file.failed':
      console.log(`File failed: execution ${resource.id}`);
      break;
    case 'transaction.processed': {
      // relatedResources holds transaction.x12.<set id> (e.g. 835, 277) and the execution
      const txn = relatedResources.find((r) => String(r.type).startsWith('transaction.x12.'));
      console.log(`Transaction processed: ${txn?.type} ${txn?.id ?? resource.id}`);
      break;
    }

    // --- OAuth apps -----------------------------------------------------------
    case 'app.installed':
    case 'app.uninstalled': {
      const client = relatedResources.find((r) => r.type === 'app.client');
      console.log(`${type}: app ${resource.id} (client ${client?.id})`);
      break;
    }

    default:
      console.log(`Unhandled Stedi event type: ${type}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC (any content type);
// express.json() would re-serialise the body and break verification.
app.post('/webhooks/stedi', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.STEDI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STEDI_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'webhook-id': req.get('webhook-id'),
    'webhook-timestamp': req.get('webhook-timestamp'),
    'webhook-signature': req.get('webhook-signature'),
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return res.status(400).json({ error: 'Missing webhook signature headers' });
  }

  const tolerance = Number(process.env.STEDI_TIMESTAMP_TOLERANCE_SECONDS || 0);
  if (!Buffer.isBuffer(req.body) || !verifyStediWebhook(req.body, headers, secret, tolerance)) {
    console.error('Stedi webhook verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Retries and manual recoveries reuse the same webhook-id; acknowledge duplicates with 200.
  const messageId = headers['webhook-id'];
  if (processedMessageIds.has(messageId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue here and process asynchronously.
    handleEvent(event);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Stedi event:', err);
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
    console.log(`Stedi webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/stedi`);
  });
}

module.exports = { app, server, verifyStediWebhook };
