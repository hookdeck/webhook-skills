// Generated with: outreach-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Outreach sends Outreach-Webhook-Signature (bare hex HMAC-SHA256 of the raw
// body, keyed with the webhook's secret) only when the webhook has a secret.
// https://developers.outreach.io/api/webhooks#authenticity-validation
function verifyOutreachSignature(rawBody: string, signatureHeader: string | null, secret: string | undefined): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so check length first
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}

export async function POST(request: NextRequest) {
  const secret = process.env.OUTREACH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OUTREACH_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw body as text; never rely on parsed JSON for verification
  const rawBody = await request.text();
  const signature = request.headers.get('outreach-webhook-signature');

  if (!signature) {
    // Usually means the webhook was created without a `secret` attribute
    return NextResponse.json({ error: 'Missing Outreach-Webhook-Signature header' }, { status: 400 });
  }

  if (!verifyOutreachSignature(rawBody, signature, secret)) {
    console.error('Outreach webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: { data?: { id?: number | string }; meta?: { eventName?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // JSON:API payload: data {type, id, attributes}, meta {deliveredAt, eventName}
  const eventName = payload.meta?.eventName;
  const id = payload.data?.id;

  switch (eventName) {
    case 'prospect.created':
      console.log(`Prospect created: ${id}`);
      break;
    case 'prospect.updated':
      console.log(`Prospect updated: ${id}`);
      break;
    case 'sequenceState.created':
      console.log(`Prospect added to a sequence (sequenceState ${id})`);
      break;
    case 'call.created':
      console.log(`Call logged: ${id}`);
      break;
    case 'task.completed':
      console.log(`Task completed: ${id}`);
      break;
    case 'mailing.replied':
      console.log(`Mailing replied: ${id}`);
      break;
    default:
      console.log(`Unhandled event: ${eventName}`);
  }

  // Respond fast: Outreach times out after 5 seconds and never retries on a status code
  return NextResponse.json({ received: true });
}
