// Generated with: ultravox-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyUltravoxWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  const secret = process.env.ULTRAVOX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ULTRAVOX_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the raw bytes Ultravox signed - never parse before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS) || 0;

  const result = verifyUltravoxWebhook(
    rawBody,
    request.headers.get('x-ultravox-webhook-signature'),
    request.headers.get('x-ultravox-webhook-timestamp'),
    secret,
    tolerance
  );
  if (!result.valid) {
    console.error('Ultravox webhook verification failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  // Verified - only now parse the body
  let payload: { event?: string };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  switch (payload.event) {
    case 'call.started':
      console.log('Call started');
      // TODO: record the call as in progress
      break;
    case 'call.joined':
      console.log('Call joined');
      // TODO: the participant connected to the call
      break;
    case 'call.ended':
      console.log('Call ended');
      // TODO: fetch the transcript / final call details
      break;
    case 'call.billed':
      console.log('Call billed');
      // TODO: reconcile usage and cost
      break;
    default:
      console.log('Unhandled Ultravox event:', payload.event);
  }

  // Ultravox recommends 204; retries on 4xx/5xx and duplicates can occur, so handle idempotently
  return new NextResponse(null, { status: 204 });
}
