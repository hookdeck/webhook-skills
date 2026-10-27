// Generated with: crossmint-webhooks skill
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

// Crossmint sends svix-* headers; fall back to the Standard Webhooks webhook-* names, as Hookdeck does
function readSignatureHeaders(headers) {
  const prefix = headers['svix-id'] ? 'svix' : 'webhook';
  return {
    id: headers[`${prefix}-id`],
    timestamp: headers[`${prefix}-timestamp`],
    signature: headers[`${prefix}-signature`],
  };
}

// IMPORTANT: express.raw() keeps the exact bytes Crossmint (Svix) signed, whatever the content type
app.post('/webhooks/crossmint', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CROSSMINT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('CROSSMINT_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { id, timestamp, signature } = readSignatureHeaders(req.headers);
  if (!id || !timestamp || !signature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(req.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Crossmint webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Every product puts the event name in the top-level `type`. The envelope around it differs:
  // wallets/offramp use `id`, checkout V3 and minting use `actionId`. The svix-id is stable across retries.
  const type = typeof event.type === 'string' ? event.type : null;
  console.log(`Received Crossmint webhook ${id}: ${type} (${event.id ?? event.actionId ?? 'no event id'})`);

  switch (type) {
    // Wallets
    case 'wallets.transfer.in':
      console.log('Transfer in:', event.data?.status, event.data?.token?.symbol, event.data?.token?.amount);
      break;
    case 'wallets.transfer.out':
      // Sent for failed transfers too: check data.status and data.error
      console.log('Transfer out:', event.data?.status, event.data?.token?.symbol, event.data?.token?.amount);
      break;
    case 'wallets.signer.exported':
      console.log('Wallet signer exported:', event.data);
      break;
    // Checkout V2 (flat body, no `data`) and V3 (order lifecycle)
    case 'purchase.succeeded':
      console.log('Purchase succeeded:', event.txId, event.walletAddress);
      break;
    case 'orders.quote.created':
    case 'orders.quote.updated':
      console.log(`${type}:`, event.data?.orderId, event.data?.phase);
      break;
    case 'orders.payment.succeeded':
      console.log('Order payment succeeded:', event.data?.orderId);
      break;
    case 'orders.payment.failed':
      console.log('Order payment failed:', event.data?.orderId);
      break;
    case 'orders.delivery.initiated':
      console.log('Order delivery initiated:', event.data?.orderId);
      break;
    case 'orders.delivery.completed':
      console.log('Order delivery completed:', event.data?.orderId);
      break;
    case 'orders.delivery.failed':
      console.log('Order delivery failed:', event.data?.orderId);
      break;
    // Minting
    case 'collections.create.succeeded':
    case 'collections.update.succeeded':
      console.log(`${type}:`, event.actionId, event.data);
      break;
    case 'nfts.create.succeeded':
    case 'nfts.update.succeeded':
      console.log(`${type}:`, event.actionId, event.data);
      break;
    case 'nfts.create.failed':
      console.log('NFT mint failed:', event.actionId, event.data);
      break;
    // Verifiable credentials
    case 'credential.creation.succeeded':
      console.log('Credential created:', event.data?.credential?.id ?? event.data);
      break;
    case 'credential.creation.failed':
      console.log('Credential creation failed:', event.data?.error ?? event.data);
      break;
    // Offramp: may arrive out of order, so compare timestamps before overwriting state
    case 'payment_methods.status.updated':
      console.log('Payment method status updated:', event.id, event.timestamp, event.data);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type: type ?? null });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Crossmint webhook server running on http://localhost:${PORT}/webhooks/crossmint`);
  });
}
