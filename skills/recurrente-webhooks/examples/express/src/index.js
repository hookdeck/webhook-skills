// Generated with: recurrente-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Recurrente (Svix) signed, whatever the content type
app.post('/webhooks/recurrente', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.RECURRENTE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('RECURRENTE_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Recurrente webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the top-level `event_type`. In the unified intent.* payload the
  // top-level `type` is the payment method (payment, bank_transfer, crypto, balance, cash)
  const type = event.event_type;
  // The delivery id (svix-id) is stable across retries: use it to deduplicate
  console.log(`Received Recurrente webhook ${id}: ${type}`);

  switch (type) {
    case 'intent.succeeded':
      // Funds are already in your balance
      console.log('Payment succeeded:', event.id, event.type, event.amount_in_cents, event.currency);
      break;
    case 'intent.pending':
      // Started but not settled (bank transfer, crypto)
      console.log('Payment pending:', event.id, event.type);
      break;
    case 'intent.failed':
      console.log('Payment failed:', event.id, event.details?.failure_reason);
      break;
    case 'intent.canceled': // one "l", unlike setup_intent.cancelled
      console.log('Payment canceled:', event.id);
      break;
    case 'intent.paid':
      // Balance payments only: sent to the paying account (the one whose balance was debited)
      console.log('Balance payment paid:', event.id, event.amount_in_cents, event.currency);
      break;
    case 'subscription.create':
    case 'subscription.past_due':
    case 'subscription.pause':
    case 'subscription.unpause':
    case 'subscription.reactivate':
    case 'subscription.update':
    case 'subscription.item_added':
    case 'subscription.item_removed':
    case 'subscription.invoice_item_added':
    case 'subscription.cancel':
      // Subscription events have their own flat payloads: check the event catalog for the shape
      console.log('Subscription event:', type);
      break;
    case 'setup_intent.succeeded':
    case 'setup_intent.cancelled': // two "l"s, unlike intent.canceled
      console.log('Setup intent event:', type);
      break;
    case 'refund.create':
      console.log('Refund processed');
      break;
    case 'dispute.create':
    case 'dispute.update':
      console.log('Chargeback event:', type);
      break;
    case 'verification.completed':
      // Connected accounts: the platform receives these with connected: true and the child account_id
      console.log('Account verification accepted:', event.account_id);
      break;
    case 'verification.rejected':
      console.log('Account verification rejected:', event.account_id, event.document_errors);
      break;
    case 'tax_invoice_settings.enabled':
      console.log('FEL tax invoicing enabled:', event.account_id, event.tax_invoicing);
      break;
    case 'account_connection.create':
      console.log('Connected account linked to the platform');
      break;
    case 'transfer.sent':
    case 'transfer.received':
      console.log('P2P transfer event:', type);
      break;
    case 'withdrawal.create':
    case 'withdrawal.update':
      // Read the status from the payload: "sent" is terminal success for local withdrawals
      console.log('Withdrawal event:', type, event.withdrawal?.status ?? event.transfer?.status);
      break;
    default:
      // Return 200 for events you don't handle, or Recurrente keeps retrying them
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Recurrente webhook server running on http://localhost:${PORT}/webhooks/recurrente`);
  });
}
