// Generated with: blindpay-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes BlindPay (Svix) signed, whatever the content type
app.post('/webhooks/blindpay', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.BLINDPAY_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('BLINDPAY_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = req.headers['svix-id'] ? 'svix' : 'webhook';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature || !Buffer.isBuffer(req.body)) {
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
    console.error('BlindPay webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Flat body: `webhook_event` first, then the resource's own fields (no wrapper object)
  const event = payload.webhook_event;
  // svix-id is stable across retries and replays: deduplicate on it (or on the resource id + event)
  console.log(`Received BlindPay webhook ${event} (${id}) for ${payload.id}`);

  switch (event) {
    case 'customer.new':
    case 'customer.update': // includes KYC status changes from BlindPay's compliance review
      console.log('Customer:', event, payload.id, payload.kyc_status);
      break;
    case 'customer.delete':
      console.log('Customer deleted:', payload.id);
      break;
    case 'bankAccount.new':
      console.log('Bank account added:', payload.id);
      break;
    case 'blockchainWallet.new':
    case 'blockchainWallet.update':
      console.log('Blockchain wallet:', event, payload.id);
      break;
    case 'tos.accept':
      console.log('Terms of service accepted:', payload.id);
      break;
    case 'payin.new':
    case 'payin.update':
      console.log('Payin in progress:', event, payload.id, payload.status);
      break;
    case 'payin.complete':
      // Sent to the destination wallet, refunded, or failed: branch on `status`
      console.log('Payin finished:', payload.id, payload.status, payload.receiver_amount);
      break;
    case 'payout.new':
    case 'payout.update': // also fires for a payout that reached `failed`
      console.log('Payout in progress:', event, payload.id, payload.status);
      break;
    case 'payout.complete':
      console.log('Payout finished:', payload.id, payload.status);
      break;
    case 'virtualAccount.new':
    case 'virtualAccount.complete':
      console.log('Virtual account:', event, payload.id);
      break;
    case 'transfer.new':
    case 'transfer.update':
    case 'transfer.complete':
      console.log('Transfer:', event, payload.id, payload.status);
      break;
    case 'wallet.new':
    case 'wallet.update':
      console.log('Managed wallet:', event, payload.id);
      break;
    case 'wallet.inbound':
      console.log('Stablecoin deposit detected:', payload.id);
      break;
    case 'limitIncrease.new':
    case 'limitIncrease.update':
      console.log('Limit increase:', event, payload.id, payload.status);
      break;
    case 'payable.new':
    case 'payable.update':
    case 'payable.complete':
      console.log('Payable:', event, payload.id, payload.status);
      break;
    default:
      // The documented list may not be exhaustive: return 200 for events you don't handle
      console.log('Unhandled BlindPay event:', event);
  }

  res.status(200).json({ success: true, event });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`BlindPay webhook server running on http://localhost:${PORT}/webhooks/blindpay`);
  });
}
