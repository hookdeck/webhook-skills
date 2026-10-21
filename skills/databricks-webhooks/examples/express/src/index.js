// Generated with: databricks-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Authenticate a Databricks webhook request.
 *
 * Databricks does NOT sign webhook payloads (no HMAC/signature header). The
 * Webhook notification destination can be given a username and password, which
 * Databricks sends as `Authorization: Basic base64(username:password)`.
 *
 * @param {string|undefined} authHeader - Authorization header value
 * @param {string|undefined} username
 * @param {string|undefined} password
 * @returns {boolean}
 */
function verifyDatabricksAuth(authHeader, username, password) {
  if (!authHeader || !username || !password || !authHeader.startsWith('Basic ')) return false;

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const i = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
  if (i === -1) return false;
  // Evaluate both comparisons so timing doesn't reveal which one failed
  const userOk = safeEqual(decoded.slice(0, i), username);
  const passOk = safeEqual(decoded.slice(i + 1), password);
  return userOk && passOk;
}

function handleDatabricksEvent(payload) {
  // Job and task notifications use `event_type`; SQL alerts use `event`.
  if (payload.event === 'alert_state_change') {
    const name = payload.alert?.alert?.name ?? payload.alert?.title;
    console.log(`SQL alert state change: ${name}`);
    // TODO: Route the alert (see payload.alert.alert.evaluations[].state)
    return;
  }

  const runId = payload.run?.run_id;
  const jobName = payload.job?.name;
  const taskKey = payload.task?.task_key;
  const where = taskKey ? `task ${taskKey} of job ${jobName}` : `job ${jobName}`;

  switch (payload.event_type) {
    case 'jobs.on_start':
      console.log(`Run ${runId} started: ${where}`);
      // TODO: Mark the pipeline as running
      break;
    case 'jobs.on_success':
      console.log(`Run ${runId} succeeded: ${where}`);
      // TODO: Trigger downstream work
      break;
    case 'jobs.on_failure':
      console.log(`Run ${runId} failed: ${where}`);
      // TODO: Alert on-call / open a ticket
      break;
    case 'jobs.on_duration_warning_threshold_exceeded':
      console.log(`Run ${runId} exceeded its duration threshold: ${where}`);
      // TODO: Warn about slow runs
      break;
    default:
      console.log(`Unhandled Databricks event: ${payload.event_type ?? payload.event ?? 'unknown'}`);
  }
}

// Accept any content type and parse JSON ourselves (no body signature to protect)
app.post('/webhooks/databricks', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const username = process.env.DATABRICKS_WEBHOOK_USERNAME;
  const password = process.env.DATABRICKS_WEBHOOK_PASSWORD;

  // Fail closed: without configured credentials there is nothing to check.
  if (!username || !password) {
    console.error('Set DATABRICKS_WEBHOOK_USERNAME and DATABRICKS_WEBHOOK_PASSWORD');
    return res.status(500).send('Webhook authentication not configured');
  }

  if (!verifyDatabricksAuth(req.headers.authorization, username, password)) {
    console.error('Databricks webhook authentication failed');
    return res.status(401).send('Unauthorized');
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).send('Invalid payload');
  }

  handleDatabricksEvent(payload);

  // Respond 2xx quickly
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, verifyDatabricksAuth };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/databricks`);
  });
}
