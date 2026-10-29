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

  // Raw body: read the exact bytes before any JSON parsing (works for any Content-Type)
  const rawBody = Buffer.from(await request.arrayBuffer());

  const signature = request.headers.get('x-bitculator-signature');
  if (!signature || !verifyBitculator(rawBody, signature, secret)) {
    console.error('Bitculator webhook signature verification failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The delivery body is not documented: parse it only if it is JSON, and don't depend on any field.
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

  // Event name: a top-level string `event` (or `type`) when present, otherwise alarm.triggered, the
  // only event Bitculator offers. `test: true` marks a delivery from POST /api/v1/webhooks/{id}/test.
  const type = str(event.event) ?? str(event.type) ?? 'alarm.triggered';
  const isTest = event.test === true;

  switch (type) {
    case 'alarm.triggered': {
      // Illustrative shape: data.alarm mirrors an item of GET /api/v1/alarms. Check every type.
      const alarm = isObject(event.data) && isObject(event.data.alarm) ? event.data.alarm : {};
      const coin = isObject(alarm.coin) ? alarm.coin : {};
      console.log(
        `${isTest ? 'Test ' : ''}alarm triggered: ${str(alarm.name) ?? '(unnamed)'} ` +
          `${str(coin.symbol) ?? ''} ${str(alarm.direction) ?? ''} ${str(alarm.target) ?? ''}`.trimEnd()
      );
      break;
    }
    default:
      console.log(`Unhandled event: ${type}`);
  }

  return NextResponse.json({ received: true });
}
