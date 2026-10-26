// Generated with: idenfy-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyIdenfySignature } from '../../../lib/verify-idenfy';

interface IdenfyWebhook {
  scanRef?: string;
  final?: boolean;
  status?: unknown;
  [key: string]: unknown;
}

// The event name is in the Idenfy-Event-Type header, not the body.
function handleEvent(eventType: string | null, body: IdenfyWebhook): void {
  switch (eventType) {
    case 'IDENTIFICATION_AUTO_FINISHED':
      console.log(`KYC auto review finished (scanRef ${body.scanRef}, final: ${body.final})`, body.status);
      // TODO: if body.final is false, wait for IDENTIFICATION_MANUAL_FINISHED
      break;

    case 'IDENTIFICATION_MANUAL_FINISHED':
      console.log(`KYC manual review finished (scanRef ${body.scanRef})`, body.status);
      // TODO: record the final approve/deny decision
      break;

    case 'IDENTIFICATION_EXPIRED':
      console.log(`KYC verification expired (scanRef ${body.scanRef})`);
      break;

    case 'IDENTIFICATION_CANCELLED':
      console.log(`KYC verification cancelled (scanRef ${body.scanRef})`);
      break;

    case 'COMPANY_REVIEW':
      console.log('KYB company review completed', body);
      break;

    case 'AML_MONITORING':
      console.log('AML monitoring result', body);
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the exact bytes received (any content type); the signature covers them.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyIdenfySignature(rawBody, request.headers.get('idenfy-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(request.headers.get('idenfy-event-type'), body as IdenfyWebhook);
  } catch (err) {
    console.error('Error handling iDenfy event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
