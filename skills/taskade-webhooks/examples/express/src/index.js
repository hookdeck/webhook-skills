// Generated with: taskade-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Taskade's docs reject a delivery whose timestamp is more than 5 minutes from your clock
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Taskade webhook signature (X-Taskade-Signature-V2)
 * @param {Buffer} rawBody - Raw request body (exactly the bytes Taskade signed)
 * @param {string} signatureHeader - X-Taskade-Signature-V2 header value (sha256=<hex>)
 * @param {string} timestampHeader - X-Taskade-Timestamp header value (unix seconds)
 * @param {string} secret - Signing secret returned at registration
 * @param {number} [nowSeconds] - Current time in unix seconds (for tests)
 * @returns {boolean} - Whether the signature is valid and the timestamp is recent
 */
function verifyTaskadeWebhook(rawBody, signatureHeader, timestampHeader, secret, nowSeconds = Date.now() / 1000) {
  if (!signatureHeader || !timestampHeader || !secret) {
    return false;
  }
  if (!/^\d+$/.test(timestampHeader)) {
    return false;
  }

  // Accept the value with or without the "sha256=" prefix
  const sig = signatureHeader.trim().replace(/^sha256=/i, '');

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-f]{64}$/i.test(sig)) {
    return false;
  }

  // HMAC-SHA256 of "<timestamp>.<raw body>"
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampHeader}.`)
    .update(rawBody)
    .digest();
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)) {
    return false;
  }

  return Math.abs(nowSeconds - Number(timestampHeader)) <= TOLERANCE_SECONDS;
}

// No field or header names the event. In Taskade's Delivery payload table, each event
// has a top-level field the other five don't. Or register one URL per event.
const EVENT_MARKERS = [
  ['task.assigned', 'assignedNodes'],
  ['comment.created', 'commentBody'],
  ['project.created', 'creatorName'],
  ['project.assigned', 'assigneeId'],
  ['project.joined', 'joinerUserId'],
  ['task.due', 'taskEndDate'],
];

/**
 * Work out which Taskade event a delivery is from its fields
 * @param {object} payload - Parsed delivery body
 * @returns {string|undefined} - The event name, or undefined if no marker field is present
 */
function taskadeEventType(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const match = EVENT_MARKERS.find(([, field]) => Object.prototype.hasOwnProperty.call(payload, field));
  return match ? match[0] : undefined;
}

// Taskade webhook endpoint. Read the raw body for any content type so the
// signature is computed over the exact bytes Taskade sent.
app.post('/webhooks/taskade',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-taskade-signature-v2'];
    const timestamp = req.headers['x-taskade-timestamp'];

    if (!verifyTaskadeWebhook(req.body, signature, timestamp, process.env.TASKADE_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // A copy of a delivery can arrive inside the 5-minute window and still pass.
    // Make these handlers idempotent, or record each delivery you process and skip a repeat.
    const event = taskadeEventType(payload);
    switch (event) {
      case 'task.due':
        console.log('Task due:', payload.id, payload.projectId);
        // Your code: send a reminder or escalate
        break;

      case 'task.assigned':
        console.log('Task assigned in project:', payload.projectId);
        // Your code: notify each assignee in payload.assignedNodes
        break;

      case 'comment.created':
        console.log('Comment on task:', payload.nodeId);
        // Your code: mirror the comment
        break;

      case 'project.created':
        console.log('Project created:', payload.projectId);
        break;

      case 'project.assigned':
        console.log('Project assigned:', payload.projectId);
        break;

      case 'project.joined':
        console.log('Project joined:', payload.projectId);
        break;

      default:
        console.log('Unrecognised Taskade delivery');
    }

    // Return 200 to acknowledge receipt
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyTaskadeWebhook, taskadeEventType };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/taskade`);
  });
}
