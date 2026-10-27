// Generated with: cyera-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyCyeraSignature } from '../../../lib/cyera';

export async function POST(request: NextRequest) {
  const secret = process.env.CYERA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CYERA_WEBHOOK_SECRET is not set');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Raw bytes, never request.json(): the exact body is what was signed.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.CYERA_WEBHOOK_TOLERANCE_SECONDS) || 0;

  const result = verifyCyeraSignature(
    rawBody,
    request.headers.get('x-webhook-signature'),
    request.headers.get('x-webhook-timestamp'),
    secret,
    tolerance
  );
  if (!result.valid) {
    console.error(`Cyera signature verification failed: ${result.error}`);
    return new NextResponse(result.error, { status: 401 });
  }

  // Parse only AFTER the signature check.
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return new NextResponse('Invalid payload', { status: 400 });
  }

  switch (payload.request_type) {
    case 'health_check':
      // Cyera pings the endpoint to check it is alive.
      return NextResponse.json({ received: true }, { status: 200 });

    case 'access':
    case 'deletion':
    case 'opt_out':
      // Queue the data-subject request, then answer 201 Created. Completion is
      // reported LATER by a PUT to payload.webhook_callback_url (API key auth).
      console.log(
        `Cyera ${payload.request_type} request`,
        payload.privacy_request_id || payload.opt_out_request_id,
        payload.topic
      );
      return NextResponse.json({ received: true }, { status: 201 });

    case 'readiness_check':
      // Cyera asks whether this system is ready to process the request.
      console.log('Cyera readiness check', payload.privacy_request_id);
      return NextResponse.json({ received: true }, { status: 200 });

    default:
      console.log(`Unhandled Cyera request_type: ${payload.request_type}`);
      return NextResponse.json({ received: true }, { status: 200 });
  }
}
