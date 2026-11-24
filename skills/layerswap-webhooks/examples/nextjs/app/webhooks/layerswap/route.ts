// Generated with: layerswap-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.LAYERSWAP_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('LAYERSWAP_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Layerswap (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
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
    console.error('Layerswap webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is the swap itself: a flat object with no event-type field (every update
  // is the one Svix `partner` event type). Route on `status`, which webhooks send in
  // PascalCase; API swap objects use snake_case (PendingDeposit = user_transfer_pending).
  const swap: Record<string, any> = payload && typeof payload === 'object' ? payload : {};
  const status: string = swap.status;
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

  return NextResponse.json({ success: true, status });
}
