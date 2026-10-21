// Generated with: openclaw-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an OpenClaw automation (cron) webhook.
 *
 * OpenClaw docs: "`webhookToken` is sent as `Authorization: Bearer <token>` on
 * automation webhook POSTs." The body is not signed, so the header is the whole
 * check. Compare the entire header value with "Bearer <webhookToken>" in constant
 * time, the same way Hookdeck's OpenClaw source does.
 *
 * @param {string|undefined} authorizationHeader - Authorization header value
 * @param {string} webhookToken - cron.webhookToken from the Gateway config
 * @returns {boolean}
 */
function verifyOpenClawWebhook(authorizationHeader, webhookToken) {
  if (!authorizationHeader || !webhookToken) return false;
  const received = Buffer.from(authorizationHeader, 'utf8');
  const expected = Buffer.from(`Bearer ${webhookToken}`, 'utf8');
  // Length check first: timingSafeEqual throws on buffers of different lengths
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/**
 * Handle a verified OpenClaw payload.
 * - Finished event (primary webhook delivery): { action: "finished", jobId, runId, status, ... }
 * - Failure alert (delivery.failureDestination in webhook mode): { jobId, jobName, message, runAtMs }
 * Field names come from OpenClaw's source (commit 5dc91d6), not its docs:
 *   https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/cron/service/state.ts#L53-L76
 *   https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L463-L468
 */
function handleOpenClawPayload(payload) {
  if (payload.action === 'finished') {
    const name = payload.job?.name || payload.jobId;
    if (payload.status === 'error' || payload.completionStatus === 'failed') {
      console.log(`Automation "${name}" failed (run ${payload.runId}): ${payload.error || 'unknown error'}`);
    } else {
      console.log(`Automation "${name}" finished (run ${payload.runId}): ${payload.summary || ''}`);
    }
    return 'finished';
  }
  if (payload.jobId && typeof payload.message === 'string') {
    console.log(`Failure alert for "${payload.jobName || payload.jobId}": ${payload.message}`);
    return 'failure_alert';
  }
  console.log('Unhandled OpenClaw payload');
  return 'unknown';
}

// OpenClaw automation webhook endpoint (set with `openclaw automations create ... --webhook <url>`)
// express.raw keeps the exact bytes; parse JSON only after the token check passes.
app.post('/webhooks/openclaw', express.raw({ type: '*/*' }), (req, res) => {
  const webhookToken = process.env.OPENCLAW_WEBHOOK_TOKEN;
  if (!webhookToken) {
    console.error('OPENCLAW_WEBHOOK_TOKEN is not set');
    return res.status(500).json({ error: 'Webhook token not configured' });
  }

  if (!verifyOpenClawWebhook(req.get('authorization'), webhookToken)) {
    console.error('OpenClaw webhook verification failed');
    return res.status(401).json({ error: 'Invalid token' });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // OpenClaw records delivery on any 2xx and does not retry an ambiguous send.
  // A relay such as Hookdeck can retry, so dedupe on runId (or jobId + runAtMs) in production.
  const kind = handleOpenClawPayload(payload);
  res.status(200).json({ received: true, kind });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyOpenClawWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`OpenClaw webhook endpoint: POST http://localhost:${PORT}/webhooks/openclaw`);
  });
}
