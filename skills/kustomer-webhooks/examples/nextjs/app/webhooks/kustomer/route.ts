// Generated with: kustomer-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Kustomer signs the raw body: hex HMAC-SHA256 keyed with the webhook token.
function verifyKustomerSignature(rawBody: string, signatureHeader: string | null, secret: string | undefined): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Naive in-memory dedupe on the event id; use a shared store in production.
const seen = new Set<string>();

export async function POST(request: NextRequest) {
  // Read the raw body: parsing JSON first would change the signed bytes.
  const rawBody = await request.text();
  const signature = request.headers.get('x-kustomer-webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Kustomer-Webhook-Signature header' }, { status: 400 });
  }

  if (!verifyKustomerSignature(rawBody, signature, process.env.KUSTOMER_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { id?: string; name?: string; data?: { id?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (event.id && seen.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (event.id) seen.add(event.id);

  // The event type is the "name" field in the body.
  switch (event.name) {
    case 'kustomer.conversation.create':
      console.log('Conversation created:', event.data?.id);
      break;
    case 'kustomer.conversation.update':
      console.log('Conversation updated:', event.data?.id);
      break;
    case 'kustomer.customer.create':
      console.log('Customer created:', event.data?.id);
      break;
    case 'kustomer.customer.update':
      console.log('Customer updated:', event.data?.id);
      break;
    case 'kustomer.message.create':
      console.log('Message created:', event.data?.id);
      break;
    case 'kustomer.message.update':
      console.log('Message updated:', event.data?.id);
      break;
    default:
      console.log('Unhandled event:', event.name);
  }

  // Respond 2xx quickly: Kustomer disables the webhook after 10 consecutive failures.
  return NextResponse.json({ received: true });
}
