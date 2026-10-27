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

  // The body is { swap, quote, deposit_actions } with no event-type field:
  // the swap's lifecycle state is `swap.status`.
  const swap: Record<string, any> = payload.swap ?? {};
  const status: string = swap.status;
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

  return NextResponse.json({ success: true, status });
}
