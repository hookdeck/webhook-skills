// Generated with: deck-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Deck (deck.co) signs `webhook` destinations with Standard Webhooks:
//   webhook-id         unique event identifier
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
//
// Deck does NOT generate the secret. You create it ("whsec_" + base64 of
// random bytes) and pass it as `webhook.secret` when creating the destination.
// ---------------------------------------------------------------------------

/**
 * Secrets to try, current first. During a rotation Deck keeps the previous
 * secret valid for 24 hours, so DECK_WEBHOOK_SECRET_PREVIOUS is accepted too.
 */
function getSecrets() {
  return [process.env.DECK_WEBHOOK_SECRET, process.env.DECK_WEBHOOK_SECRET_PREVIOUS].filter(
    Boolean
  );
}

/**
 * Verify a Deck delivery with the official Standard Webhooks SDK.
 * The SDK checks the timestamp (5-minute tolerance), recomputes the HMAC over
 * the raw body, and compares in constant time against every `v1,` entry.
 *
 * @param {Buffer|string} rawBody - the exact bytes Deck sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @returns {object} the parsed, verified event
 * @throws {Error} if no configured secret verifies the delivery
 */
function verifyDeckWebhook(rawBody, headers, secrets = getSecrets()) {
  let lastError = new Error('No signing secret configured');
  for (const secret of secrets) {
    try {
      return new Webhook(secret).verify(rawBody, headers);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// In-memory dedupe for the demo. Use Redis or your database in production —
// Deck delivers at least once and retries if you don't 2xx within 5 seconds.
const processedEventIds = new Set();

function handleEvent(event) {
  const { type, data } = event;

  switch (type) {
    // --- Task runs ---------------------------------------------------------
    case 'task_run.interaction_required':
      // Time-sensitive: the user is waiting (MFA, security question, account
      // selection) and the interaction window is 5 minutes. Build your prompt
      // from data.interaction.fields, then answer with
      // POST /v2/task-runs/{data.id}/interaction  {"input": {"<field name>": "<value>"}}
      console.log(
        `Task run ${data.id} needs ${data.interaction?.type}: ${data.interaction?.message}`
      );
      break;
    case 'task_run.completed':
      console.log(`Task run ${data.id} completed (result=${data.result}, ${data.runtime_ms}ms)`);
      break;
    case 'task_run.failed':
      console.log(`Task run ${data.id} failed (result=${data.result})`);
      break;
    case 'task_run.queued':
    case 'task_run.running':
    case 'task_run.canceling':
    case 'task_run.canceled':
      console.log(`Task run ${data.id} -> ${data.status}`);
      break;

    // --- Credentials (Deck Vault) -----------------------------------------
    case 'credential.verified':
      console.log(`Credential ${data.id} verified for user ${data.external_id}`);
      break;
    case 'credential.invalid':
      // The source rejected the login — ask your user to update credentials.
      console.log(`Credential ${data.id} invalid for user ${data.external_id}`);
      break;
    case 'credential.created':
    case 'credential.unverified':
    case 'credential.deleted':
      console.log(`Credential ${data.id} -> ${data.status}`);
      break;

    // --- Workflow runs (note: workflow_run_id, not id) ---------------------
    case 'workflow_run.completed':
    case 'workflow_run.failed':
    case 'workflow_run.canceled':
      console.log(`Workflow run ${data.workflow_run_id} ${data.status} (result=${data.result})`);
      break;
    case 'workflow_run.queued':
    case 'workflow_run.running':
    case 'workflow_run.paused':
    case 'workflow_run.canceling':
      console.log(`Workflow run ${data.workflow_run_id} -> ${data.status}`);
      break;

    // --- Storage -----------------------------------------------------------
    case 'storage.created':
      console.log(`File stored: ${data.file_name} (${data.file_type}) from task run ${data.task_run_id}`);
      break;
    case 'storage.deleted':
      console.log(`File deleted: ${data.id}`);
      break;

    // --- Sessions ----------------------------------------------------------
    case 'session.queued':
    case 'session.running':
    case 'session.idle':
    case 'session.completing':
    case 'session.completed':
    case 'session.failed':
      console.log(`Session ${data.id} -> ${data.status}`);
      break;

    // --- Event destinations ------------------------------------------------
    case 'event_destination.activated':
    case 'event_destination.deactivated':
      console.log(`Destination ${data.id} is now ${data.status}`);
      break;

    // --- Definitions: agents, sources, tasks, workflows --------------------
    case 'agent.created':
    case 'agent.updated':
    case 'agent.deleted':
    case 'source.created':
    case 'source.updated':
    case 'source.deleted':
    case 'task.created':
    case 'task.updated':
    case 'task.reset':
    case 'task.deleted':
      console.log(`${type}: ${data.id}`);
      break;
    case 'workflow.created':
    case 'workflow.updated':
    case 'workflow.deleted':
      console.log(`${type}: ${data.workflow_id}`);
      break;

    // --- Test ping (Console "Send test ping" / POST .../test) --------------
    case 'test.ping':
      console.log('Received Deck test.ping');
      break;

    default:
      console.log(`Unhandled Deck event type: ${type}`);
  }
}

// Deck webhook endpoint — express.raw() keeps the exact bytes for the HMAC.
// Re-serialised JSON (express.json()) breaks signature verification.
app.post('/webhooks/deck', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (getSecrets().length === 0) {
    console.error('DECK_WEBHOOK_SECRET is not set — rejecting delivery');
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

  let event;
  try {
    event = verifyDeckWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Deck webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Deck needs a 2xx within 5 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling Deck event:', err);
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
    console.log(`Deck webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/deck`);
  });
}

module.exports = { app, server, verifyDeckWebhook };
