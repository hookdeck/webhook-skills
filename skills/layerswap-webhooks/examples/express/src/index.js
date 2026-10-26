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

  // The body is { swap, quote, deposit_actions } with no event-type field:
  // the swap's lifecycle state is `swap.status`.
  const swap = payload.swap ?? {};
  const status = swap.status;
  // No retry schedule or ordering is documented: deduplicate on swap.id + status
  // and fetch GET /swaps/{id} before any irreversible action.
  console.log(`Received Layerswap webhook for swap ${swap.id}: ${status}`);

  switch (status) {
    case 'user_transfer_pending':
      // Swap created; waiting for the user's deposit (expires after 6 hours without one)
      console.log('Awaiting deposit:', swap.id, payload.deposit_actions);
      break;
    case 'ls_transfer_pending':
      // Deposit confirmed; Layerswap is executing the swap. Not final: it can retry for a while
      console.log('Swap executing:', swap.id);
      break;
    case 'completed':
      // Funds delivered to the destination address: safe to fulfil after reconciling with GET /swaps/{id}
      console.log('Swap completed:', swap.id, swap.metadata?.reference_id, payload.quote?.receive_amount);
      break;
    case 'failed':
      console.log('Swap failed:', swap.id, swap.fail_reason);
      break;
    case 'expired':
      console.log('Swap expired (no deposit within 6 hours):', swap.id);
      break;
    case 'pending_refund':
      console.log('Refund pending:', swap.id, swap.fail_reason);
      break;
    case 'refunded':
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
