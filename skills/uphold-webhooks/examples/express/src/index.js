// Generated with: uphold-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { Webhook } from 'svix';

export const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Uphold Enterprise (Core API) webhooks are delivered by Svix, white-labelled:
//   webhook-id         unique message id (same value on every retry)
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint secret after its `whsec_` prefix.
// Uphold defers to Svix's verification guide, so we use the official `svix`
// SDK, which accepts the unbranded webhook-* header names directly.
// ---------------------------------------------------------------------------

/**
 * Verify an Uphold delivery, then parse it. The SDK checks the timestamp
 * (5-minute tolerance), recomputes the HMAC over the raw body, and compares
 * in constant time against every `v1,` entry in webhook-signature.
 *
 * Note: in svix 2.x, `Webhook.verify()` returns nothing (it only throws), so
 * parse the raw body yourself once verification has passed.
 *
 * @param {string} rawBody - the exact bytes Uphold sent, as a UTF-8 string
 * @param {object} headers - webhook-id / webhook-timestamp / webhook-signature
 * @param {string} secret - the whsec_ endpoint secret from the Webhooks Portal
 * @returns {object} the verified event
 * @throws {Error} WebhookVerificationError if the signature doesn't match
 */
export function verifyUpholdWebhook(rawBody, headers, secret = process.env.UPHOLD_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody);
}

// In-memory dedupe for the demo. Use Redis or your database in production —
// Svix delivers at least once and retries failed deliveries for up to 24 hours.
const processedEventIds = new Set();

function handleEvent(event) {
  const { type, data } = event;

  switch (type) {
    // --- Users --------------------------------------------------------------
    case 'core.user.created':
      console.log(`User created: ${data.user.id} (${data.user.type})`);
      break;
    case 'core.user.deleted':
      console.log(`User deleted: ${data.user.id}`);
      break;

    // --- Transactions -------------------------------------------------------
    case 'core.transaction.created':
      console.log(`Transaction created: ${data.transaction.id} (${data.transaction.status})`);
      break;
    case 'core.transaction.status-changed': {
      const tx = data.transaction;
      // status: processing | on-hold | completed | failed
      if (tx.status === 'completed') {
        console.log(`Transaction ${tx.id} completed: ${tx.destination?.amount} ${tx.destination?.asset}`);
      } else if (tx.status === 'failed' || tx.status === 'on-hold') {
        console.log(`Transaction ${tx.id} ${tx.status} (reason=${tx.statusDetails?.reason})`);
      } else {
        console.log(`Transaction ${tx.id} -> ${tx.status}`);
      }
      break;
    }

    // --- Accounts -----------------------------------------------------------
    case 'core.account.created':
    case 'core.account.archived':
    case 'core.account.unarchived':
      console.log(`${type}: account ${data.account.id} (${data.account.asset})`);
      break;
    case 'core.account.balance-changed':
      console.log(
        `Account ${data.account.id} balance: ${data.account.balance.available} available / ${data.account.balance.total} total ${data.account.asset}`
      );
      break;

    // --- External accounts (cards, banks, APMs, crypto) --------------------
    case 'core.external-account.created':
    case 'core.external-account.deleted':
      console.log(`${type}: external account ${data.externalAccount.id}`);
      break;
    case 'core.external-account.status-changed':
      console.log(
        `External account ${data.externalAccount.id} -> ${data.externalAccount.status}`
      );
      break;

    // --- Assets -------------------------------------------------------------
    case 'core.assets.cooldown-ended':
      console.log(`Cooldown ended for user ${data.userId}`);
      break;

    default:
      // KYC / KYB process events share one shape: { status, userId } (plus
      // associatedPersonId for associated-person events).
      // status: ok | failed | running | pending | exempt
      if (type.startsWith('core.kyc.') || type.startsWith('core.kyb.')) {
        console.log(`${type}: user ${data.userId} -> ${data.status}`);
      } else {
        console.log(`Unhandled Uphold event type: ${type}`);
      }
  }
}

// Uphold webhook endpoint — express.raw() keeps the exact bytes for the HMAC.
// Re-serialised JSON (express.json()) breaks signature verification.
app.post('/webhooks/uphold', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.UPHOLD_WEBHOOK_SECRET) {
    console.error('UPHOLD_WEBHOOK_SECRET is not set — rejecting delivery');
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
    event = verifyUpholdWebhook(req.body.toString('utf8'), headers);
  } catch (err) {
    console.error('Uphold webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Dedupe on the Uphold event id (payload `id`). Retries also reuse the
  // webhook-id header, so either works as an idempotency key.
  if (processedEventIds.has(event.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast. In production, enqueue the event and process it
    // asynchronously so slow work doesn't cause timeouts and retries.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling Uphold event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start the server only when run directly (not when imported by the tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Uphold webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/uphold`);
  });
}
