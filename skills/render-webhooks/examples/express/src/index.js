// Generated with: render-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Render signs webhook notifications with Standard Webhooks:
//   webhook-id         the service event ID (evt-...), same on every retry
//   webhook-timestamp  Unix seconds when this delivery attempt was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: the signing secret from the webhook's Settings page in the Render
// Dashboard. The SDK strips an optional `whsec_` prefix and base64-decodes it.
// ---------------------------------------------------------------------------

/**
 * Verify a Render delivery with the Standard Webhooks SDK (Render's docs
 * recommend these libraries). The SDK checks the timestamp (5-minute
 * tolerance), recomputes the HMAC over the raw body, and compares in
 * constant time against every `v1,` entry.
 *
 * @param {Buffer|string} rawBody - the exact bytes Render sent
 * @param {object} headers - must contain webhook-id/-timestamp/-signature
 * @param {string} secret - RENDER_WEBHOOK_SECRET
 * @returns {object} the parsed, verified notification
 * @throws {WebhookVerificationError} on a bad signature or stale timestamp
 */
function verifyRenderWebhook(rawBody, headers, secret = process.env.RENDER_WEBHOOK_SECRET) {
  return new Webhook(secret).verify(rawBody, headers);
}

// In-memory dedupe for the demo. Use Redis or your database in production —
// Render retries failed deliveries (up to 8 attempts) with the same data.id.
const processedEventIds = new Set();

/**
 * Render sends a "thin" payload: { type, timestamp, data: { id, serviceId,
 * serviceName, status? } }. `status` (succeeded | failed | canceled) is only
 * present on build_ended, deploy_ended, cron_job_run_ended and job_run_ended.
 * Fetch full details with GET https://api.render.com/v1/events/{data.id}.
 */
function handleEvent(event) {
  const { type, data } = event;
  const service = `${data.serviceName} (${data.serviceId})`;

  switch (type) {
    // --- Deployment lifecycle ----------------------------------------------
    case 'build_started':
      console.log(`Build started for ${service}`);
      break;
    case 'build_ended':
      console.log(`Build ended for ${service}: ${data.status}`);
      break;
    case 'deploy_started':
      console.log(`Deploy started for ${service}`);
      break;
    case 'deploy_ended':
      if (data.status === 'succeeded') {
        // e.g. trigger smoke tests or deploy a dependent service
        console.log(`Deploy succeeded for ${service}`);
      } else {
        console.log(`Deploy ${data.status} for ${service}`);
      }
      break;
    case 'pre_deploy_started':
    case 'pre_deploy_ended':
    case 'commit_ignored':
    case 'branch_deleted':
    case 'image_pull_failed':
    case 'pipeline_minutes_exhausted':
      console.log(`${type} for ${service}`);
      break;

    // --- Jobs and cron jobs -------------------------------------------------
    case 'cron_job_run_started':
      console.log(`Cron job run started for ${service}`);
      break;
    case 'cron_job_run_ended':
    case 'job_run_ended':
      console.log(`${type} for ${service}: ${data.status}`);
      break;

    // --- Service availability ----------------------------------------------
    case 'server_failed':
    case 'server_hardware_failure':
      // Page someone / post to chat — the service is down.
      console.log(`Service unavailable: ${service} (${type})`);
      break;
    case 'server_available':
    case 'server_restarted':
    case 'service_suspended':
    case 'service_resumed':
      console.log(`${type} for ${service}`);
      break;

    // --- Scaling -------------------------------------------------------------
    case 'autoscaling_started':
    case 'autoscaling_ended':
    case 'instance_count_changed':
      // Instance counts are in the Retrieve event API response (details).
      console.log(`${type} for ${service}`);
      break;

    // --- Render Postgres / Key Value ----------------------------------------
    case 'postgres_unavailable':
    case 'key_value_unhealthy':
      console.log(`Datastore problem: ${type} for ${service}`);
      break;
    case 'postgres_available':
    case 'key_value_available':
      console.log(`${type} for ${service}`);
      break;

    default:
      // Render adds event types over time — acknowledge anything unknown.
      console.log(`Unhandled Render event type: ${type}`);
  }
}

// Render webhook endpoint — express.raw() keeps the exact bytes for the HMAC.
// Re-serialised JSON (express.json()) breaks signature verification.
app.post('/webhooks/render', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.RENDER_WEBHOOK_SECRET) {
    console.error('RENDER_WEBHOOK_SECRET is not set — rejecting delivery');
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
    event = verifyRenderWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Render webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // data.id is identical across retries — acknowledge duplicates with 200.
  const eventId = event.data?.id;
  if (processedEventIds.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: Render needs a 2xx within 15 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Render event:', err);
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
    console.log(`Render webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/render`);
  });
}

module.exports = { app, server, verifyRenderWebhook };
