// Generated with: layerswap-webhooks skill
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

// IMPORTANT: express.raw() keeps the exact bytes Layerswap (Svix) signed, whatever the content type
app.post('/webhooks/layerswap', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LAYERSWAP_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('LAYERSWAP_WEBHOOK_SECRET is missing or not a whsec_ secret');
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
    console.error('Layerswap webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The body is the swap itself: a flat object with no event-type field (every update
  // is the one Svix `partner` event type). Route on `status`, which webhooks send in
  // PascalCase; API swap objects use snake_case (PendingDeposit = user_transfer_pending).
  const swap = payload && typeof payload === 'object' ? payload : {};
  const status = swap.status;
  // Deduplicate side effects on swap id + status (or a transaction hash), compare
  // `timestamp` (Unix ms) for ordering, and fetch GET /swaps/{id} before crediting funds.
  console.log(`Received Layerswap webhook for swap ${swap.id}: ${status}`);

  switch (status) {
    case 'PendingDeposit':
      // API user_transfer_pending: waiting for the user's deposit (expires after 6 hours without one)
      console.log('Awaiting deposit:', swap.id, swap.deposit_address);
      break;
    case 'PendingWithdrawal':
      // API ls_transfer_pending: Layerswap is processing the swap. Not final
      console.log('Swap executing:', swap.id);
      break;
    case 'Completed':
      // Funds delivered to the destination address: fulfil after confirming with GET /swaps/{id}
      console.log('Swap completed:', swap.id, swap.reference_id, swap.amount);
      break;
    case 'Failed':
      console.log('Swap failed:', swap.id);
      break;
    case 'Expired':
      console.log('Swap expired (no deposit within 6 hours):', swap.id);
      break;
    case 'PendingRefund':
      console.log('Refund pending:', swap.id);
      break;
    case 'Refunded':
      console.log('Swap refunded:', swap.id);
      break;
    default:
      // Return 200 for statuses you don't handle, or Svix keeps retrying them
      console.log('Unhandled swap status:', status);
  }

  res.status(200).json({ success: true, status });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Layerswap webhook server running on http://localhost:${PORT}/webhooks/layerswap`);
  });
}
