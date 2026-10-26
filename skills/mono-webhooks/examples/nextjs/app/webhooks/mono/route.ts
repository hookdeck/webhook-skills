// Generated with: mono-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMonoRequest } from '../../../lib/verify-mono';

interface MonoPayload {
  event?: string;
  event_id?: string;
  timestamp?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  [key: string]: unknown;
}

// event_id is reused across Mono's retries. Use a shared store (Redis, a DB unique key) in production.
const seenEventIds = new Set<string>();

function handleEvent(payload: MonoPayload): void {
  const { event, data } = payload;

  switch (event) {
    case 'mono.events.account_connected':
      console.log(`Account connected: ${data?.id}`);
      // TODO: store data.id for the customer (data.meta.ref) and start retrieving data
      break;

    case 'mono.events.account_updated':
      console.log(`Account updated: ${data?.account?._id}`);
      // TODO: sync data.account and check data.meta.data_status
      break;

    case 'mono.events.account_unlinked':
      console.log('Account unlinked');
      // TODO: remove the stored account
      break;

    case 'direct_debit.payment_successful':
      console.log(`Payment successful: ${data?.object?.reference}`);
      // TODO: fulfil the order for data.object.reference
      break;

    case 'direct_debit.payment_failed':
      console.log(`Payment failed: ${data?.object?.reference}`);
      // TODO: notify the customer and offer a retry
      break;

    case 'direct_debit.payment_cancelled':
      console.log(`Payment cancelled: ${data?.object?.reference}`);
      // TODO: release held stock
      break;

    case 'direct_debit.payment_abandoned':
      console.log(`Payment abandoned: ${data?.object?.reference}`);
      // TODO: expire the pending payment
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyMonoRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing mono-webhook-secret' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const body = payload as MonoPayload;
  if (body.event_id && seenEventIds.has(body.event_id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(body);
  } catch (err) {
    console.error('Error handling Mono event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (body.event_id) seenEventIds.add(body.event_id);
  return NextResponse.json({ received: true });
}
