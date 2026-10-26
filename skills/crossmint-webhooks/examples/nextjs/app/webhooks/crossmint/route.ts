// Generated with: crossmint-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Crossmint sends svix-* headers; fall back to the Standard Webhooks webhook-* names, as Hookdeck does
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('svix-id') ? 'svix' : 'webhook';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.CROSSMINT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('CROSSMINT_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id, timestamp, signature } = readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Crossmint (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Crossmint webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Every product puts the event name in the top-level `type`. The envelope around it differs:
  // wallets/offramp use `id`, checkout V3 and minting use `actionId`. The svix-id is stable across retries.
  const type: string | null = typeof event.type === 'string' ? event.type : null;
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

  return NextResponse.json({ success: true, type });
}
