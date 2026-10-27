// Generated with: lodgix-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLodgixSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  const secret = process.env.LODGIX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LODGIX_WEBHOOK_SECRET is not set');
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  // Raw bytes, exactly as received
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.LODGIX_WEBHOOK_TOLERANCE_SECONDS) || 0;

  const result = verifyLodgixSignature(
    rawBody,
    request.headers.get('x-lodgix-timestamp'),
    request.headers.get('x-lodgix-signature'),
    secret,
    tolerance
  );
  if (!result.valid) {
    console.error(`Lodgix signature verification failed: ${result.error}`);
    return new NextResponse(result.error, { status: 401 });
  }

  // Parse only after verification
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const event = request.headers.get('x-lodgix-event');
  const deliveryId = request.headers.get('x-lodgix-delivery'); // use for idempotency

  switch (event) {
    case 'message.received':
      // Illustrative payload: Lodgix does not document the body shape
      console.log(`Guest message received (delivery ${deliveryId}):`, payload);
      break;
    default:
      console.log(`Unhandled Lodgix event: ${event}`);
  }

  return NextResponse.json({ received: true });
}
