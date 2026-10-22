// Generated with: flagsmith-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFlagsmithSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  const secret = process.env.FLAGSMITH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FLAGSMITH_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-flagsmith-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Flagsmith-Signature header' }, { status: 400 });
  }

  // CRITICAL: read the raw text body (any content type) - the signature covers these exact bytes
  const rawBody = await request.text();

  if (!verifyFlagsmithSignature(rawBody, signature, secret)) {
    console.error('Flagsmith signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Environment and audit-log webhooks use { event_type, data }.
  // Identity webhooks have no event_type: they send { identity, flags, traits, segments }.
  switch (payload.event_type) {
    case 'FLAG_UPDATED':
      console.log('Flag updated:', payload.data?.new_state?.feature?.name);
      break;
    case 'FLAG_DELETED':
      console.log('Flag deleted:', payload.data?.feature?.name ?? payload.data?.new_state?.feature?.name);
      break;
    case 'AUDIT_LOG_CREATED':
      console.log('Audit log:', payload.data?.log);
      break;
    case undefined:
      if (payload.identity !== undefined) {
        console.log('Identity evaluation for:', payload.identity);
      } else {
        console.log('Unrecognized Flagsmith payload');
      }
      break;
    default:
      console.log('Unhandled Flagsmith event:', payload.event_type);
  }

  return NextResponse.json({ received: true });
}
