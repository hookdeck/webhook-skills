import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Returnless webhook signature:
 * lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret's UTF-8 bytes.
 */
function verifyReturnlessWebhook(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!secret || typeof signatureHeader !== 'string') {
    return false;
  }

  // Validate the format first: exactly 64 hex characters
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Equal-length buffers, compared in constant time
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase()),
    Buffer.from(expected)
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.RETURNLESS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RETURNLESS_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes (whatever the Content-Type) for signature verification
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Signature header' }, { status: 401 });
  }

  if (!verifyReturnlessWebhook(rawBody, signature, secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is in the X-Event-Name header, not the body
  const event = request.headers.get('x-event-name');
  const resourceId = payload?.data?.id;
  console.log(`Received ${event} event (${resourceId})`);

  switch (event) {
    case 'request.created':
      console.log(`Return request ${resourceId} submitted`);
      break;

    case 'request.approved':
    case 'request.approved_with_manual_shipment':
    case 'request.approved_without_shipment':
      console.log(`Return request ${resourceId} approved (${event})`);
      // TODO: Notify the customer or create a label
      break;

    case 'request.rejected':
      console.log(`Return request ${resourceId} rejected`);
      break;

    case 'return.created':
      console.log(`Return ${resourceId} created`);
      // TODO: Sync the return to your ERP or OMS
      break;

    case 'return.product.marked_as_received':
      console.log(`Returned product received on ${resourceId}`);
      // TODO: Restock inventory or trigger a refund
      break;

    case 'shipment.delivered':
      console.log(`Shipment ${resourceId} delivered`);
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt (any 2XX counts as success)
  return NextResponse.json({ received: true });
}
