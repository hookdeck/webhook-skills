// Generated with: qonto-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { handleQontoEvent, verifyQontoSignature, type QontoEvent } from '../../../lib/qonto';

export async function POST(request: NextRequest) {
  const secret = process.env.QONTO_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never accept unverified deliveries.
    console.error('QONTO_WEBHOOK_SECRET is not set; rejecting webhook');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Raw bytes for any content type; parse only after verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = parseInt(process.env.QONTO_WEBHOOK_TOLERANCE_SECONDS || '0', 10) || 0;
  const verification = verifyQontoSignature(
    rawBody,
    request.headers.get('x-qonto-signature'),
    secret,
    tolerance
  );
  if (!verification.valid) {
    console.error('Qonto webhook verification failed:', verification.error);
    return new NextResponse(`Webhook Error: ${verification.error}`, { status: 401 });
  }

  let event: QontoEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON payload', { status: 400 });
  }

  // Qonto expects a 2xx within 1 second: acknowledge first, process after.
  setImmediate(() => {
    try {
      handleQontoEvent(event);
    } catch (err) {
      console.error('Error processing Qonto event:', err);
    }
  });
  return NextResponse.json({ received: true });
}
