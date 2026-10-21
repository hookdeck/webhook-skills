// Generated with: dwolla-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Dwolla signs the raw body: HMAC-SHA256, hex, keyed with the subscription secret.
function verifySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

// In-memory dedupe by event ID; use a database or Redis in production.
const processedEvents = new Set<string>();

export async function POST(request: NextRequest) {
  // Raw body, never re-encoded JSON
  const rawBody = await request.text();
  const signature = request.headers.get('x-request-signature-sha-256');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Request-Signature-SHA-256 header' }, { status: 400 });
  }

  if (!verifySignature(rawBody, signature, process.env.DWOLLA_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { id: string; topic: string; resourceId: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Duplicates must still return 2xx or Dwolla may pause the subscription.
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  processedEvents.add(event.id);

  switch (event.topic) {
    case 'customer_created':
      console.log('Customer created:', event.resourceId);
      break;
    case 'customer_verified':
      console.log('Customer verified:', event.resourceId);
      break;
    case 'customer_funding_source_added':
      console.log('Funding source added:', event.resourceId);
      break;
    case 'customer_funding_source_verified':
      console.log('Funding source verified:', event.resourceId);
      break;
    case 'customer_transfer_created':
      console.log('Transfer created:', event.resourceId);
      break;
    case 'customer_transfer_completed':
      console.log('Transfer completed:', event.resourceId);
      break;
    case 'customer_transfer_failed':
      console.log('Transfer failed:', event.resourceId);
      break;
    case 'customer_bank_transfer_completed':
      console.log('Bank transfer completed:', event.resourceId);
      break;
    default:
      console.log('Unhandled topic:', event.topic);
  }

  return NextResponse.json({ received: true });
}
