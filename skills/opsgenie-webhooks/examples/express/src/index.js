// Generated with: opsgenie-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on buffers of different sizes.
 */
function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Opsgenie does not sign webhooks. You add a custom header to the Webhook integration;
 * the header name is yours to choose. Compare the WHOLE header value with the secret,
 * exactly as typed in Opsgenie (a "Bearer " prefix, if you used one, is part of the value).
 * This authenticates the sender, not the body, and gives no replay protection.
 */
function verifyOpsgenieRequest(
  headers,
  headerName = process.env.OPSGENIE_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.OPSGENIE_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleAction(payload) {
  const { action, alert = {} } = payload;
  const id = alert.alertId;

  switch (action) {
    case 'Create':
      console.log(`Alert created: ${id} ${alert.message}`);
      // TODO: open a ticket or post to chat (alert.tags, alert.teams, alert.recipients)
      break;

    case 'Acknowledge':
      console.log(`Alert acknowledged: ${id}`);
      // TODO: mark the ticket as in progress (alert.username)
      break;

    case 'UnAcknowledge':
      console.log(`Alert unacknowledged: ${id}`);
      // TODO: reopen the ticket
      break;

    case 'AddNote':
      console.log(`Note added: ${id}`);
      // TODO: sync alert.note as a comment
      break;

    case 'AddTags':
      console.log(`Tags added: ${id} ${alert.addedTags}`);
      // TODO: sync alert.addedTags (comma-separated)
      break;

    case 'RemoveTags':
      console.log(`Tags removed: ${id} ${alert.removedTags}`);
      // TODO: sync alert.removedTags (comma-separated)
      break;

    case 'Close':
      console.log(`Alert closed: ${id}`);
      // TODO: resolve the ticket
      break;

    case 'AssignOwnership':
      console.log(`Ownership assigned: ${id} -> ${alert.owner}`);
      // TODO: assign the ticket to alert.owner
      break;

    case 'TakeOwnership':
      console.log(`Ownership taken: ${id}`);
      // TODO: assign the ticket to alert.username
      break;

    case 'Delete':
      console.log(`Alert deleted: ${id}`);
      // TODO: remove or archive the ticket
      break;

    case 'Escalate':
      // The Escalate payload carries only alert.alertId plus escalationName and escalationNotify.
      console.log(`Alert escalated: ${id} (${payload.escalationName})`);
      // TODO: notify payload.escalationNotify
      break;

    case 'UpdatePriority':
      console.log(`Priority updated: ${id} ${alert.oldPriority} -> ${alert.priority}`);
      // TODO: sync alert.priority
      break;

    case 'UpdateDescription':
      console.log(`Description updated: ${id}`);
      // TODO: sync alert.description
      break;

    case 'UpdateMessage':
      console.log(`Message updated: ${id}`);
      // TODO: sync alert.message
      break;

    case 'AddTeam':
      console.log(`Team added: ${id} ${alert.team}`);
      // TODO: notify alert.team
      break;

    case 'AddRecipient':
      console.log(`Recipient added: ${id} ${alert.recipient}`);
      // TODO: notify alert.recipient
      break;

    default:
      // Custom alert actions send their own name as `action`.
      console.log(`Custom or unhandled action: ${action}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/opsgenie', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyOpsgenieRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
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
    handleAction(payload);
  } catch (err) {
    console.error('Error handling Opsgenie action:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyOpsgenieRequest = verifyOpsgenieRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/opsgenie`);
  });
}
