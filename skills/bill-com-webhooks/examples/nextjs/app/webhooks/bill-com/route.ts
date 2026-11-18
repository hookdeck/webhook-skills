// Generated with: bill-com-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyBillSignature, handleBillEvent, type BillEvent } from '../../../lib/verify-bill-com';

export async function POST(request: Request) {
  const secret = process.env.BILL_WEBHOOK_SECURITY_KEY;
  if (!secret?.trim()) {
    console.error('BILL_WEBHOOK_SECURITY_KEY is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyBillSignature(rawBody, request.headers.get('x-bill-sha-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: BillEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as BillEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleBillEvent(event));
}
