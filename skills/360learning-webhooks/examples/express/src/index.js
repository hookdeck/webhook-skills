// Generated with: 360learning-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// 360Learning delivers webhooks through Svix and signs them the Standard
// Webhooks way:
//   webhook-id         unique event ID, the same on every retry
//   webhook-timestamp  Unix seconds of this attempt
//   webhook-signature  space-separated "v1,<base64 HMAC-SHA256>" entries
//                      (two during the 24 hours after a secret rotation)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: the base64-DECODED signing secret of the subscription. Strip an
// optional whsec_ prefix first.
//
// 360Learning's own Node sample signs JSON.stringify(req.body). That only
// matches when re-serialising the parsed body reproduces the exact bytes sent.
// Verify the raw body instead.
// ---------------------------------------------------------------------------

/**
 * Split THREE_SIXTY_LEARNING_WEBHOOK_SECRET into a list. Every subscription
 * has its own secret, so one route that receives several subscriptions
 * (one per event type) needs all of them, comma-separated.
 */
function parseSecrets(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Verify a 360Learning delivery.
 *
 * @param {Buffer|string} rawBody - the exact bytes 360Learning sent
 * @param {object} headers - lower-cased webhook-id / webhook-timestamp / webhook-signature
 * @param {string|string[]} secrets - one secret, or one per subscription
 * @param {number|null} toleranceSeconds - optional freshness window; null = off.
 *   360Learning recommends one (5 minutes). Each attempt gets a fresh timestamp,
 *   but a delivery replayed later through a relay or queue keeps its original
 *   timestamp, so a window rejects it. Dedupe on webhook-id either way.
 * @returns {boolean}
 */
function verify360LearningWebhook(rawBody, headers, secrets, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  const secretList = (Array.isArray(secrets) ? secrets : [secrets]).filter(Boolean);
  if (!id || !timestamp || !signatureHeader || secretList.length === 0) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;
  }

  const given = [];
  for (const entry of signatureHeader.trim().split(/\s+/)) {
    const [version, signature] = entry.split(',');
    if (version === 'v1' && signature) given.push(Buffer.from(signature, 'base64'));
  }

  let ok = false;
  for (const secret of secretList) {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    if (key.length === 0) continue;
    const expected = crypto
      .createHmac('sha256', key)
      .update(`${id}.${timestamp}.`)
      .update(rawBody)
      .digest();
    // Check every v1 entry: after a rotation one is signed with the new
    // secret and one with the old. Any match passes.
    for (const sig of given) {
      if (sig.length === expected.length && crypto.timingSafeEqual(sig, expected)) ok = true;
    }
  }
  return ok;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedEventIds = new Set();

/**
 * Most events are `{ type, timestamp (ms), data }`. The `xapi` and
 * `xapi.started` subscriptions send an xAPI statement instead (no `type`).
 */
function handleEvent(event) {
  if (typeof event.type !== 'string') {
    if (event.verb && event.actor) {
      console.log(`xAPI statement ${event.id}: ${event.verb.id} ${event.object && event.object.id}`);
    } else {
      console.log('Unrecognised 360Learning payload');
    }
    return;
  }

  const data = event.data || {};
  switch (event.type) {
    case 'user.created':
    case 'user.updated':
    case 'user.deleted':
    case 'user.activated':
    case 'user.invited':
    case 'user.reactivated':
      console.log(`${event.type}: user ${data.userId}`);
      break;
    case 'course.attempt.closed':
      console.log(`Attempt ${data.attemptId} on course ${data.courseId} closed (${data.reason})`);
      break;
    case 'path.session.user.status.updated':
      console.log(`User ${data.userId} is ${data.status} in session ${data.sessionId}`);
      break;
    case 'path.session.users.enrolled':
    case 'path.session.users.unenrolled':
      // No user IDs in the payload: call List all enrollments for the session.
      console.log(`${event.type}: session ${data.sessionId} of path ${data.pathId}`);
      break;
    case 'user.certificate.awarded':
      console.log(`Certificate ${data.certificateId} awarded to ${data.userId}`);
      break;
    case 'user.assessment.corrected':
      console.log(`Assessment ${data.assessmentId} for ${data.userId}: success=${data.success}`);
      break;
    case 'bulk.operation.ended':
      console.log(`Bulk operation ${data.bulkOperationId} (${data.type}) ${data.status}`);
      break;
    default:
      // 54 event types exist. Acknowledge the ones you don't handle.
      console.log(`Unhandled 360Learning event type: ${event.type}`);
  }
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/360learning', express.raw({ type: '*/*' }), (req, res) => {
  const secrets = parseSecrets(process.env.THREE_SIXTY_LEARNING_WEBHOOK_SECRET);
  if (secrets.length === 0) {
    console.error('THREE_SIXTY_LEARNING_WEBHOOK_SECRET is not set: rejecting delivery');
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

  const tolerance = process.env.THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS
    ? Number(process.env.THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS)
    : null;
  if (!verify360LearningWebhook(req.body, headers, secrets, tolerance)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // webhook-id is the same on every retry: acknowledge duplicates.
  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Respond within 15 seconds: verify, enqueue, return 2xx, work asynchronously.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling 360Learning event:', err);
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
    console.log(`360Learning webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/360learning`);
  });
}

module.exports = { app, server, verify360LearningWebhook, parseSecrets };
