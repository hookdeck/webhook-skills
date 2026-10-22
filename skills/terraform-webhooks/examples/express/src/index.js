// Generated with: terraform-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an HCP Terraform / Terraform Enterprise notification signature.
 *
 * For generic notifications with a token set, HCP Terraform sends
 * X-TFE-Notification-Signature: the hex HMAC-SHA512 of the RAW request body,
 * keyed with the notification configuration's token.
 *
 * @param {Buffer} rawBody - Raw request body (do not parse before verifying)
 * @param {string} signatureHeader - X-TFE-Notification-Signature header value (hex)
 * @param {string} token - Notification configuration token
 * @returns {boolean} Whether the signature is valid
 */
function verifyTerraformSignature(rawBody, signatureHeader, token) {
  if (!signatureHeader || !token) {
    return false;
  }

  const expected = crypto
    .createHmac('sha512', token)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guard against length/format mismatches.
  try {
    const received = Buffer.from(signatureHeader, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * List the triggers carried by a payload.
 * - Run payloads (payload_version 1) have a notifications[] array.
 * - Workspace payloads (payload_version "2") have a top-level trigger.
 * - Change request payloads have no trigger; they are team:change_request.
 */
function getTriggers(payload) {
  if (Array.isArray(payload.notifications)) {
    return payload.notifications.map((n) => n.trigger);
  }
  if (payload.trigger) {
    return [payload.trigger];
  }
  if (payload.change_request_url) {
    return ['team:change_request'];
  }
  return [];
}

// Terraform notification endpoint. Reads the raw body for any content type.
app.post(
  '/webhooks/terraform',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const token = process.env.TERRAFORM_NOTIFICATION_TOKEN;
    if (!token) {
      console.error('TERRAFORM_NOTIFICATION_TOKEN is not set');
      return res.status(500).send('Webhook token not configured');
    }

    if (!verifyTerraformSignature(req.body, req.headers['x-tfe-notification-signature'], token)) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verifying the raw body.
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    for (const trigger of getTriggers(payload)) {
      handleTerraformEvent(trigger, payload);
    }

    // Any 2xx passes HCP Terraform's verification request (trigger "verification").
    res.status(200).send('OK');
  }
);

/**
 * Dispatch a single trigger. Do heavy work asynchronously after responding.
 */
function handleTerraformEvent(trigger, payload) {
  switch (trigger) {
    case 'verification':
      // Sent when you enable a configuration or click "Send a test".
      console.log('Verification request received');
      break;

    case 'run:created':
      console.log(`Run ${payload.run_id} created in ${payload.workspace_name}`);
      // TODO: Record the new run.
      break;

    case 'run:planning':
      console.log(`Run ${payload.run_id} is planning`);
      break;

    case 'run:needs_attention':
      console.log(`Run ${payload.run_id} needs attention: ${payload.run_url}`);
      // TODO: Notify an approver.
      break;

    case 'run:applying':
      console.log(`Run ${payload.run_id} is applying`);
      break;

    case 'run:completed':
      console.log(`Run ${payload.run_id} completed in ${payload.workspace_name}`);
      // TODO: Trigger downstream deploy steps.
      break;

    case 'run:errored':
      console.log(`Run ${payload.run_id} errored (${payload.notifications?.[0]?.run_status})`);
      // TODO: Alert on-call.
      break;

    case 'assessment:drifted':
      console.log(`Drift detected in ${payload.details?.workspace_name}`);
      // TODO: Open a drift ticket.
      break;

    case 'assessment:check_failure':
      console.log(`Continuous validation checks failed in ${payload.details?.workspace_name}`);
      break;

    case 'assessment:failed':
      console.log(`Health assessment failed in ${payload.details?.workspace_name}`);
      break;

    case 'workspace:auto_destroy_reminder':
    case 'workspace:auto_destroy_run_results':
    case 'workspace:deleted':
    case 'team:change_request':
      console.log(`Received ${trigger}`);
      break;

    default:
      console.log(`Unhandled trigger: ${trigger}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyTerraformSignature, getTriggers };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/terraform`);
  });
}
