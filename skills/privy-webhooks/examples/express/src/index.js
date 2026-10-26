// Generated with: privy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Privy (Svix) signed, whatever the content type
app.post('/webhooks/privy', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PRIVY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('PRIVY_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Privy webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `type`; the event's own fields (user, wallet_id, ...)
  // sit beside it at the top level, not under `data`
  const type = event.type;
  // svix-id is stable across retries; `idempotency_key` (where present) identifies the event itself
  console.log(`Received Privy webhook ${id}: ${type}`);

  switch (type) {
    case 'privy.test':
      // Sent by the dashboard's "Test webhook" button
      console.log('Test webhook:', event.message);
      break;
    case 'user.created':
      console.log('User created:', event.user?.id);
      break;
    case 'user.authenticated':
      console.log('User authenticated:', event.user?.id);
      break;
    case 'user.linked_account':
    case 'user.unlinked_account':
      console.log(`User ${type.split('.')[1]}:`, event.user?.id);
      break;
    case 'user.wallet_created':
      console.log('Wallet created for user:', event.user?.id);
      break;
    case 'user.deleted':
      console.log('User deleted:', event.user?.id);
      break;
    case 'mfa.enabled':
    case 'mfa.disabled':
      console.log(`MFA ${type.split('.')[1]}:`, event.user?.id);
      break;
    case 'wallet.funds_deposited':
    case 'wallet.funds_withdrawn':
      console.log(`Wallet ${type.split('.')[1]}:`, event.wallet_id);
      break;
    case 'wallet.private_key_export':
      // Security-relevant: alert or audit-log this one
      console.log('Private key exported:', event.wallet_id);
      break;
    case 'transaction.broadcasted':
    case 'transaction.confirmed':
    case 'transaction.failed':
    case 'transaction.execution_reverted':
      console.log(`Transaction ${type.split('.')[1]}:`, event.transaction_hash);
      break;
    case 'wallet_action.swap.created':
    case 'wallet_action.swap.succeeded':
    case 'wallet_action.swap.failed':
      console.log(`Swap ${type.split('.')[2]}:`, event.wallet_id);
      break;
    case 'intent.created':
    case 'intent.executed':
      console.log(`Intent ${type.split('.')[1]}`);
      break;
    case 'user_operation.completed':
      console.log('User operation completed');
      break;
    default:
      // Return 200 for events you don't handle, or Privy keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Privy webhook server running on http://localhost:${PORT}/webhooks/privy`);
  });
}
