// Generated with: claude-managed-agents-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify Claude Managed Agents webhook signature (Standard Webhooks).
 *
 * @param {Buffer|string} payload - Raw request body
 * @param {string} webhookId - Value of webhook-id header
 * @param {string} webhookTimestamp - Value of webhook-timestamp header
 * @param {string} webhookSignature - Value of webhook-signature header
 * @param {string} secret - whsec_-prefixed signing key
 * @returns {boolean} Whether the signature is valid
 */
function verifyClaudeSignature(payload, webhookId, webhookTimestamp, webhookSignature, secret) {
  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Reject payloads older than 5 minutes to prevent replay attacks
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (Number.isNaN(timestampDiff) || timestampDiff > 300 || timestampDiff < -300) {
    return false;
  }

  // The signature is HMAC-SHA256 over "{id}.{timestamp}.{rawBody}"
  const payloadStr = payload instanceof Buffer ? payload.toString('utf8') : payload;
  const signedContent = `${webhookId}.${webhookTimestamp}.${payloadStr}`;

  // whsec_ prefix wraps a base64-encoded 32-byte key
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let secretBytes;
  try {
    secretBytes = Buffer.from(secretKey, 'base64');
  } catch {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  // The header may carry multiple space-separated "v1,<sig>" pairs (rotation)
  return webhookSignature.split(' ').some((pair) => {
    const [version, signature] = pair.split(',');
    if (version !== 'v1' || !signature) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  });
}

// CRITICAL: Use express.raw() for the webhook endpoint — signature is over raw bytes
app.post(
  '/webhooks/claude-managed-agents',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const webhookId = req.headers['webhook-id'];
    const webhookTimestamp = req.headers['webhook-timestamp'];
    const webhookSignature = req.headers['webhook-signature'];
    const secret = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY;

    if (!secret) {
      console.error('ANTHROPIC_WEBHOOK_SIGNING_KEY is not set');
      return res.status(500).send('Webhook signing key not configured');
    }

    if (!verifyClaudeSignature(req.body, webhookId, webhookTimestamp, webhookSignature, secret)) {
      console.error('Claude Managed Agents webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the verified payload
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      console.error('Failed to parse webhook payload:', err);
      return res.status(400).send('Invalid JSON payload');
    }

    // CMA payloads carry the event type under data.type; the top-level
    // event.type is always "event". Switch on event.data.type.
    const eventType = event.data && event.data.type;
    const resourceId = event.data && event.data.id;

    switch (eventType) {
      case 'session.status_run_started':
        console.log(`Session run started: ${resourceId}`);
        break;

      case 'session.status_idled':
        console.log(`Session idled (awaiting input): ${resourceId}`);
        // TODO: client.beta.sessions.retrieve(resourceId) and notify user
        break;

      case 'session.status_rescheduled':
        console.log(`Session rescheduled (transient error, auto-retrying): ${resourceId}`);
        break;

      case 'session.status_terminated':
        console.log(`Session terminated: ${resourceId}`);
        // TODO: alert on-call, persist final state
        break;

      case 'session.thread_created':
        console.log(`Multiagent thread created: ${resourceId}`);
        break;

      case 'session.thread_idled':
        console.log(`Multiagent thread idled: ${resourceId}`);
        break;

      case 'session.thread_terminated':
        console.log(`Multiagent thread terminated: ${resourceId}`);
        break;

      case 'session.outcome_evaluation_ended':
        console.log(`Outcome evaluation ended for session: ${resourceId}`);
        break;

      case 'vault.created':
        console.log(`Vault created: ${resourceId}`);
        break;

      case 'vault.archived':
        console.log(`Vault archived: ${resourceId}`);
        break;

      case 'vault.deleted':
        console.log(`Vault deleted: ${resourceId}`);
        break;

      case 'vault_credential.created':
        console.log(`Vault credential created: ${resourceId}`);
        break;

      case 'vault_credential.archived':
        console.log(`Vault credential archived: ${resourceId}`);
        break;

      case 'vault_credential.deleted':
        console.log(`Vault credential deleted: ${resourceId}`);
        break;

      case 'vault_credential.refresh_failed':
        console.log(`Vault credential refresh failed: ${resourceId}`);
        // TODO: trigger OAuth re-consent flow for the user
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Return 200 to acknowledge receipt. Anything other than 2xx triggers a retry.
    res.status(200).json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/claude-managed-agents`);
  });
}
