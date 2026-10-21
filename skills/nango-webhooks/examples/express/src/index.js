// Generated with: nango-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Nango } = require('@nangohq/node');

const app = express();

let nango;

/**
 * The SDK verifies with `webhookSigningKey` (Environment Settings > Webhooks >
 * Signing key). The constructor also requires an API key, which you need
 * anyway to fetch records after a sync webhook.
 */
function getNango() {
  if (!nango) {
    nango = new Nango({
      apiKey: process.env.NANGO_API_KEY,
      webhookSigningKey: process.env.NANGO_WEBHOOK_SIGNING_KEY,
    });
  }
  return nango;
}

function handleAuth(webhook) {
  const { operation, success, connectionId, providerConfigKey, tags } = webhook;

  switch (operation) {
    case 'creation':
      if (success) {
        // Required: save connectionId against the user/org that started the flow
        console.log(`Connection created: ${connectionId} (${providerConfigKey})`, tags);
      } else {
        console.log(`Connection creation failed (${providerConfigKey}):`, webhook.error);
      }
      break;
    case 'override':
      console.log(`Connection re-authorized: ${connectionId} (success=${success})`);
      break;
    case 'refresh':
      if (success) {
        console.log(`Connection recovered after refresh failure: ${connectionId}`);
      } else {
        console.log(`Token refresh failed for ${connectionId}:`, webhook.error);
      }
      break;
    case 'deletion':
      console.log(`Connection deleted: ${connectionId}`);
      break;
    default:
      console.log(`Unhandled auth operation: ${operation}`);
  }
}

function handleSync(webhook) {
  const { success, connectionId, syncName, model } = webhook;

  if (!success) {
    console.log(`Sync ${syncName} failed for ${connectionId}:`, webhook.error);
    return;
  }

  // checkpoints may be missing or null; treat that (or from === null) as a full sync
  const isFullSync = !webhook.checkpoints || webhook.checkpoints.from === null;
  console.log(
    `Sync ${syncName} (${model}) succeeded for ${connectionId}`,
    { modifiedAfter: webhook.modifiedAfter, results: webhook.responseResults, isFullSync }
  );
  // Fetch changed records here, e.g. nango.listRecords({ ... }), using a cursor
}

function handleForward(webhook) {
  if (webhook.unverified) {
    // Nango could not check the external provider's signature; treat as untrusted
    console.warn(`Unverified forward from ${webhook.from}`);
  }
  console.log(`Forwarded ${webhook.from} webhook for connection ${webhook.connectionId ?? '(unattributed)'}`);
}

app.post('/webhooks/nango', express.raw({ type: '*/*' }), (req, res) => {
  if (!process.env.NANGO_WEBHOOK_SIGNING_KEY || !process.env.NANGO_API_KEY) {
    console.error('NANGO_WEBHOOK_SIGNING_KEY and NANGO_API_KEY must be set');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  if (!req.get('x-nango-hmac-sha256')) {
    return res.status(400).json({ error: 'Missing X-Nango-Hmac-Sha256 header' });
  }

  // Verify against the raw body string, never re-serialised JSON
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!getNango().verifyIncomingWebhookRequest(rawBody, req.headers)) {
    console.error('Nango webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let webhook;
  try {
    webhook = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  switch (webhook?.type) {
    case 'auth':
      handleAuth(webhook);
      break;
    case 'sync':
      handleSync(webhook);
      break;
    case 'forward':
      handleForward(webhook);
      break;
    case 'async_action':
      console.log(`Async action finished for ${webhook.connectionId}`);
      break;
    default:
      // New types are added without notice, and unattributed forwards arrive
      // as the raw provider payload without a Nango wrapper. Acknowledge them.
      console.log('Unhandled Nango webhook:', webhook?.type ?? '(raw forwarded payload)');
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/nango`);
  });
}
