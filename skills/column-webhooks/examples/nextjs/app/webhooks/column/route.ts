// Generated with: column-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Column signs every delivery with a Column-Signature header: the bare lowercase hex
// HMAC-SHA256 of the raw request body, keyed with the endpoint's signing secret.
// Nothing else is signed (no timestamp or id), so there is no replay window to check.
// https://docs.column.com/markdown/working-with-the-api/events-and-webhooks
function verifyColumn(rawBody: Buffer, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return false;

  // The whole header is one 64-char hex digest. Check the format first: Buffer.from(x, 'hex')
  // silently drops invalid characters, so never decode an unvalidated value.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex'); // safe: validated above
  return crypto.timingSafeEqual(received, expected);
}

export async function POST(request: NextRequest) {
  const secret = process.env.COLUMN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('COLUMN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: read before any JSON parsing, whatever the Content-Type is
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyColumn(rawBody, request.headers.get('column-signature'), secret)) {
    console.error('Column webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Delivery is at-least-once: redeliveries keep the same event id (evnt_...), so dedupe on it.
  // Ordering is not guaranteed.
  switch (event.type) {
    case 'ach.outgoing_transfer.completed':
      console.log(`ACH transfer completed: ${event.data?.id} [${event.id}]`);
      break;
    case 'ach.outgoing_transfer.returned':
      console.log(`ACH transfer returned: ${event.data?.id} [${event.id}]`);
      break;
    case 'book.transfer.completed':
      console.log(`Book transfer completed: ${event.data?.id} [${event.id}]`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
