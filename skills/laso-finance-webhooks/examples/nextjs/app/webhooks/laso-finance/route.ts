// Generated with: laso-finance-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Laso Finance sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.LASO_FINANCE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('LASO_FINANCE_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Laso Finance signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(
      rawBody,
      { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature },
      { jsonParse: false },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Laso Finance webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The envelope is { type, timestamp, data }; data is { user_id, title, text, category }
  const type = event.type;
  const data = event.data ?? {};
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Laso Finance webhook ${id}: ${type}`);

  switch (type) {
    case 'notification.account':
      console.log('Account:', data.title);
      break;
    case 'notification.transaction':
      console.log('Transaction:', data.title);
      break;
    case 'notification.deposit':
      console.log('Deposit:', data.title);
      break;
    case 'notification.withdrawal':
      console.log('Withdrawal:', data.title);
      break;
    case 'notification.card':
      console.log('Card:', data.title);
      break;
    case 'notification.giftCard':
      console.log('Gift card:', data.title);
      break;
    case 'notification.refund':
      console.log('Refund:', data.title);
      break;
    case 'notification.balanceUpdate':
      console.log('Balance update:', data.title);
      break;
    default:
      // The category list is open-ended ("Categories include ..."): ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
