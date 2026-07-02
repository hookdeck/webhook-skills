// Generated with: square-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { WebhooksHelper } from 'square';

const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!;
// The notification URL is part of the signed content, so it must match the URL
// registered on your Square webhook subscription exactly.
const notificationUrl = process.env.SQUARE_WEBHOOK_URL!;

/**
 * Verify a Square webhook using the official SDK helper.
 * Square signs HMAC-SHA256(notificationUrl + rawBody), base64-encoded.
 */
async function verifySquareSignature(
  rawBody: string,
  signatureHeader: string
): Promise<boolean> {
  try {
    return await WebhooksHelper.verifySignature({
      requestBody: rawBody,
      signatureHeader,
      signatureKey,
      notificationUrl,
    });
  } catch (err) {
    // Thrown when the signature key or notification URL is missing/empty.
    console.error('Square signature verification error:', (err as Error).message);
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification - do not parse JSON first.
  const rawBody = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature');

  if (!signature) {
    console.error('Missing Square signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  if (!(await verifySquareSignature(rawBody, signature))) {
    console.error('Square webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after the signature is verified.
  const event = JSON.parse(rawBody);
  const { type, event_id, data } = event;

  console.log(`Received Square event ${type} (${event_id})`);

  // Handle the event based on its type.
  switch (type) {
    case 'payment.created':
      console.log('Payment created:', data?.id);
      // TODO: Record the sale, start fulfillment, etc.
      break;

    case 'payment.updated':
      console.log('Payment updated:', data?.id);
      // TODO: Confirm capture, reconcile ledgers, etc.
      break;

    case 'refund.created':
      console.log('Refund created:', data?.id);
      // TODO: Update order status, notify customer, etc.
      break;

    case 'refund.updated':
      console.log('Refund updated:', data?.id);
      // TODO: Reconcile refunds when completed, etc.
      break;

    case 'invoice.payment_made':
      console.log('Invoice payment made:', data?.id);
      // TODO: Mark invoice paid, send receipt, etc.
      break;

    case 'order.created':
      console.log('Order created:', data?.id);
      // TODO: Sync to inventory / OMS, etc.
      break;

    case 'order.updated':
      console.log('Order updated:', data?.id);
      // TODO: Update fulfillment, sync line items, etc.
      break;

    case 'customer.created':
      console.log('Customer created:', data?.id);
      // TODO: CRM sync, welcome email, etc.
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }

  // Return 2xx promptly to acknowledge receipt.
  return NextResponse.json({ received: true });
}
