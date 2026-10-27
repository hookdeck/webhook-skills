// Generated with: campfire-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyCampfireSignature } from '../../../lib/campfire';

export async function POST(request: NextRequest) {
  // Raw bytes, read before any parsing: the signature covers them exactly.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS) || 0;

  const valid = verifyCampfireSignature(
    rawBody,
    request.headers.get('campfire-webhook-request-timestamp'),
    request.headers.get('campfire-webhook-signature-v1'),
    process.env.CAMPFIRE_WEBHOOK_SECRET,
    tolerance
  );
  if (!valid) {
    console.error('Campfire webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { topic?: string; data?: { id?: number; [key: string]: unknown } };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Campfire sends { webhook_uuid, topic, data, changes }. *.deleted topics
  // carry only { id } in data and null in changes.
  switch (event.topic) {
    case 'Invoice.created':
      console.log(`Invoice created: ${event.data?.id} (${event.data?.invoice_number})`);
      break;
    case 'Invoice.payment':
      // Fires on every increase in amount paid, including partial payments.
      console.log(`Invoice payment: ${event.data?.id}, amount paid ${event.data?.amount_paid}`);
      break;
    case 'Invoice.paid':
      // Fully paid. Campfire also sends Invoice.payment and no Invoice.updated.
      console.log(`Invoice paid: ${event.data?.id}`);
      break;
    case 'Bill.created':
      console.log(`Bill created: ${event.data?.id}`);
      break;
    case 'Bill.paid':
      console.log(`Bill paid: ${event.data?.id}`);
      break;
    case 'JournalEntry.created':
      console.log(`Journal entry created: ${event.data?.id}`);
      break;
    case 'Invoice.deleted':
    case 'Bill.deleted':
      console.log(`${event.topic}: ${event.data?.id}`);
      break;
    default:
      console.log(`Unhandled Campfire topic: ${event.topic}`);
  }

  // Deliveries are unordered and can repeat: treat data as the latest state of
  // the object, and acknowledge fast (2xx) before doing slow work.
  return NextResponse.json({ received: true });
}
