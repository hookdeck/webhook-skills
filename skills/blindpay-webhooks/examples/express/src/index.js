// Generated with: blindpay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import 'dotenv/config';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { Webhook } from 'svix';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// BlindPay delivers webhooks through Svix:
//   svix-id         message ID (stable across retries)
//   svix-timestamp  Unix seconds when the message was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * Verify a BlindPay delivery with the official Svix library.
 * Svix checks the timestamp (fixed 5-minute window), recomputes the HMAC over
 * the raw body, and compares in constant time against every `v1,` entry.
 *
 * The 5-minute window also rejects late Hookdeck retries and replays, which
 * keep the original timestamp. See references/verification.md for a manual
 * verifier without the window.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so parse the
 * JSON yourself afterwards.
 *
 * @param {Buffer|string} rawBody - the exact bytes BlindPay sent
 * @param {object} headers - svix-id / svix-timestamp / svix-signature
 * @param {string} secret - the endpoint's whsec_ signing secret
 * @returns {object} the parsed, verified payload
 * @throws {WebhookVerificationError} if the signature or timestamp is invalid
 */
export function verifyBlindPayWebhook(rawBody, headers, secret = process.env.BLINDPAY_WEBHOOK_SECRET) {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody.toString('utf8'));
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// svix-id is the same on every retry of a message.
const processedMessageIds = new Set();

function handleEvent(event) {
  // The body is flat: `webhook_event` plus the resource's own fields.
  const { webhook_event: eventType } = event;

  switch (eventType) {
    // --- Customers ---------------------------------------------------------
    case 'customer.new':
    case 'customer.update':
    case 'customer.delete':
      console.log(`${eventType}: customer ${event.id} (${event.kyc_status ?? event.status ?? 'n/a'})`);
      break;
    case 'tos.accept':
      console.log(`Terms of service accepted: ${event.id}`);
      break;

    // --- Bank accounts and wallets -------------------------------------------
    case 'bankAccount.new':
      console.log(`Bank account added: ${event.id}`);
      break;
    case 'blockchainWallet.new':
    case 'blockchainWallet.update':
    case 'wallet.new':
    case 'wallet.update':
      console.log(`${eventType}: ${event.id}`);
      break;
    case 'wallet.inbound':
      // Funds arrived in a wallet.
      console.log(`Inbound wallet funds: ${event.id}`);
      break;

    // --- Payins --------------------------------------------------------------
    case 'payin.new':
    case 'payin.update':
      console.log(`${eventType}: payin ${event.id} is ${event.status}`);
      break;
    case 'payin.complete':
      // Carries amounts, fees, bank details and tracking objects.
      console.log(`Payin completed: ${event.id} for customer ${event.customer_id}`);
      break;

    // --- Payouts -------------------------------------------------------------
    case 'payout.new':
    case 'payout.update':
      console.log(`${eventType}: payout ${event.id} is ${event.status}`);
      break;
    case 'payout.complete':
      console.log(`Payout completed: ${event.id}`);
      break;

    // --- Virtual accounts ----------------------------------------------------
    case 'virtualAccount.new':
    case 'virtualAccount.complete':
      console.log(`${eventType}: ${event.id}`);
      break;

    // --- Transfers -----------------------------------------------------------
    case 'transfer.new':
    case 'transfer.update':
    case 'transfer.complete':
      console.log(`${eventType}: transfer ${event.id} is ${event.status}`);
      break;

    // --- Limit increases and payables ----------------------------------------
    case 'limitIncrease.new':
    case 'limitIncrease.update':
    case 'payable.new':
    case 'payable.update':
    case 'payable.complete':
      console.log(`${eventType}: ${event.id}`);
      break;

    default:
      console.log(`Unhandled BlindPay event type: ${eventType}`);
  }
}

// BlindPay webhook endpoint. express.raw() keeps the exact bytes for the HMAC
// whatever the content type; express.json() before verification would break it.
app.post('/webhooks/blindpay', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.BLINDPAY_WEBHOOK_SECRET) {
    console.error('BLINDPAY_WEBHOOK_SECRET is not set — rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headers = {
    'svix-id': req.get('svix-id'),
    'svix-timestamp': req.get('svix-timestamp'),
    'svix-signature': req.get('svix-signature'),
  };
  if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
    return res.status(400).json({ error: 'Missing Svix signature headers' });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  let event;
  try {
    event = verifyBlindPayWebhook(req.body, headers);
  } catch (err) {
    console.error('BlindPay webhook verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Duplicates are normal (retries reuse svix-id) — acknowledge with 200.
  if (processedMessageIds.has(headers['svix-id'])) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast. In production, enqueue the event and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(headers['svix-id']);
  } catch (err) {
    console.error('Error handling BlindPay event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export { app };

// Start the server only when run directly (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`BlindPay webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/blindpay`);
  });
}
