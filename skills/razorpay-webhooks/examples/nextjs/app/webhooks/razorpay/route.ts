// Generated with: razorpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the RAW request body with HMAC-SHA256 (hex) using the webhook
 * secret and sends it in the `X-Razorpay-Signature` header. The official SDK's
 * static `validateWebhookSignature(body, signature, secret)` recomputes the
 * HMAC and returns a boolean.
 */
export function verifyRazorpayWebhook(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }
  try {
    // rawBody must be the raw string, NOT parsed JSON.
    return Razorpay.validateWebhookSignature(rawBody, signature, secret);
  } catch {
    // Thrown when any argument is missing/invalid.
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do not parse first)
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');

  // Verify the signature BEFORE parsing the body
  if (!verifyRazorpayWebhook(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification succeeds
  const payload = JSON.parse(rawBody);
  const event = payload.event;

  console.log(`Received ${event} event (created_at: ${payload.created_at})`);

  // The event type is in the body's `event` field, not a header.
  switch (event) {
    case 'payment.authorized': {
      const payment = payload.payload.payment.entity;
      console.log(`Payment authorized: ${payment.id} (${payment.amount} ${payment.currency})`);
      // TODO: Capture the payment or hold for review.
      break;
    }

    case 'payment.captured': {
      const payment = payload.payload.payment.entity;
      console.log(`Payment captured: ${payment.id} (${payment.amount} ${payment.currency})`);
      // TODO: Fulfil the order, grant access, send a receipt.
      break;
    }

    case 'payment.failed': {
      const payment = payload.payload.payment.entity;
      console.log(`Payment failed: ${payment.id} (${payment.error_description || 'unknown error'})`);
      // TODO: Notify the customer, offer a retry.
      break;
    }

    case 'order.paid': {
      const order = payload.payload.order.entity;
      console.log(`Order paid: ${order.id} (amount_paid: ${order.amount_paid})`);
      // TODO: Mark the order complete, start fulfilment.
      break;
    }

    case 'refund.processed': {
      const refund = payload.payload.refund.entity;
      console.log(`Refund processed: ${refund.id} for payment ${refund.payment_id}`);
      // TODO: Update your ledger, notify the customer.
      break;
    }

    case 'subscription.charged': {
      const subscription = payload.payload.subscription.entity;
      console.log(`Subscription charged: ${subscription.id}`);
      // TODO: Extend access, issue an invoice.
      break;
    }

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 2xx to acknowledge receipt (Razorpay retries otherwise)
  return NextResponse.json({ received: true });
}
