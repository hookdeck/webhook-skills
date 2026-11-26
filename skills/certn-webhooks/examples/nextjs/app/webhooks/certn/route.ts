// Generated with: certn-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// CertnCentric webhooks: https://centric-api-docs.certn.co/#webhooks
// - Endpoint verification: Certn sends GET ?challenge=<value> when you add the URL, and again
//   periodically. Echo the value as the body within 10 seconds, or Certn disables the webhook.
// - Signature: X-Signature is the hex HMAC-SHA256 of the raw request body, keyed with the
//   signing key Certn gives you when you create the webhook. No timestamp, no prefix.

function verifyCertn(rawBody: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return false;
  // Exactly 64 hex chars first, then compare equal-length lowercase hex strings in constant time
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}

// Endpoint verification (challenge-response). Not signed: don't run the signature check here.
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge');
  if (challenge === null) {
    return new NextResponse('Missing challenge', { status: 400 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.CERTN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CERTN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body: read as text before any JSON parsing, whatever the Content-Type is
  const rawBody = await request.text();

  if (!verifyCertn(rawBody, request.headers.get('x-signature'), secret)) {
    console.error('Certn webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Deduplicate on event.event_id before doing work: retries can deliver an event again,
  // and out of order. Return 200 within 10 seconds and do slow work in a background job.
  switch (event.event_type) {
    case 'CASE_STATUS_CHANGED':
      console.log(`Case ${event.object_id} status: ${event.case_status}`);
      break;
    case 'CHECK_STATUS_CHANGED': {
      const check = event.triggered_check ?? {};
      console.log(`Case ${event.object_id} check ${check.type} status: ${check.status}`);
      if (check.action_required_resolution) {
        // Follow steps[] in ascending `step` order with Certn's API to resolve the check
        console.log(`Client action required: ${check.action_required_resolution.summary}`);
      }
      break;
    }
    case 'CASE_REPORT_READY':
      console.log(`Case ${event.object_id} report ready`);
      break;
    case 'CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED':
      console.log(`Case ${event.object_id} has new input claims`);
      break;
    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }

  return NextResponse.json({ received: true });
}
