// Generated with: bitculator-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyBitculator } from '../../../lib/bitculator';

type Obj = Record<string, unknown>;
const isObject = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

export async function POST(request: NextRequest) {
  const secret = process.env.BITCULATOR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BITCULATOR_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Bitculator POSTs each event as JSON. Read the exact bytes before any JSON parsing (the signature
  // covers them; works for any Content-Type).
  const rawBody = Buffer.from(await request.arrayBuffer());

  const signature = request.headers.get('x-bitculator-signature');
  if (!signature || !verifyBitculator(rawBody, signature, secret)) {
    console.error('Bitculator webhook signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // X-Bitculator-Event names the event (alarm.triggered). It is NOT covered by the signature, so read
  // it only after verifying and use it as a routing label. Without it, assume alarm.triggered, the
  // only event Bitculator offers. Acknowledge and skip events this handler doesn't know.
  const type = request.headers.get('x-bitculator-event') || 'alarm.triggered';
  if (type !== 'alarm.triggered') {
    console.log(`Skipping unhandled event: ${type}`);
    return NextResponse.json({ received: true });
  }

  // Documented body (the alarmTriggered callback in Bitculator's OpenAPI spec): { event, created_at,
  // data: { alarm: { id, name, coin, metric, direction, target, triggered_at } } }. Parse it defensively.
  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    console.log('Verified Bitculator delivery with a non-JSON body');
    return NextResponse.json({ received: true });
  }
  if (!isObject(event)) {
    console.log('Verified Bitculator delivery whose JSON body is not an object');
    return NextResponse.json({ received: true });
  }

  // A delivery from POST /api/v1/webhooks/{id}/test sends data: { test: true, alarm: null }.
  const data = isObject(event.data) ? event.data : {};
  const isTest = data.test === true;
  // Check every field's type before reading into it.
  const alarm = isObject(data.alarm) ? data.alarm : {};
  const coin = isObject(alarm.coin) ? alarm.coin : {};
  console.log(
    `${isTest ? 'Test ' : ''}alarm triggered: ${str(alarm.name) ?? '(unnamed)'} ` +
      `${str(coin.symbol) ?? ''} ${str(alarm.direction) ?? ''} ${str(alarm.target) ?? ''}`.trimEnd()
  );
  // Your code: notify, trade or update dashboards. Deliveries are retried, so deduplicate, for
  // example on data.alarm.id with data.alarm.triggered_at.

  return NextResponse.json({ received: true });
}
