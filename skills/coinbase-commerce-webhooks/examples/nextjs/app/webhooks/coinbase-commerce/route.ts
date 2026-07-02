// Generated with: coinbase-commerce-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'coinbase-commerce-node';

const webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do not JSON.parse first).
  const rawBody = await request.text();
  const signature = request.headers.get('x-cc-webhook-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-CC-Webhook-Signature header' },
      { status: 400 }
    );
  }

  let event: { type: string; data: { id: string } };
  try {
    // Verify the signature using the official Coinbase Commerce SDK.
    // Returns the verified event; throws on an invalid signature or payload.
    event = Webhook.verifyEventBody(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // Handle the event based on its type.
  switch (event.type) {
    case 'charge:created':
      console.log('Charge created:', event.data.id);
      // TODO: Record the pending charge.
      break;

    case 'charge:pending':
      console.log('Charge pending (payment detected):', event.data.id);
      // TODO: Show a "payment received, confirming" state.
      break;

    case 'charge:confirmed':
      console.log('Charge confirmed:', event.data.id);
      // TODO: Fulfill the order, grant access, send a receipt.
      break;

    case 'charge:failed':
      console.log('Charge failed:', event.data.id);
      // TODO: Cancel the order, notify the customer.
      break;

    case 'charge:delayed':
      console.log('Charge delayed (late/under/overpaid):', event.data.id);
      // TODO: Flag for manual review.
      break;

    case 'charge:resolved':
      console.log('Charge resolved:', event.data.id);
      // TODO: Complete or refund based on the resolution.
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt.
  return NextResponse.json({ received: true });
}
