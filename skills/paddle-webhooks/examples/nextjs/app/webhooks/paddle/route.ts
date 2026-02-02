import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Paddle webhook signature
 */
function verifyPaddleSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  try {
    // Parse the signature header (format: ts=1234567890;h1=abc123...)
    const parts = signatureHeader.split(';');
    const timestamp = parts.find(p => p.startsWith('ts='))?.slice(3);
    const signatures = parts
      .filter(p => p.startsWith('h1='))
      .map(p => p.slice(3));

    if (!timestamp || signatures.length === 0) {
      return false;
    }

    // Build the signed payload (timestamp:rawBody)
    const signedPayload = `${timestamp}:${payload}`;

    // Compute the expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    // Check if any signature matches (handles secret rotation)
    return signatures.some(sig => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig),
          Buffer.from(expectedSignature)
        );
      } catch {
        return false;
      }
    });
  } catch (err) {
    console.error('Error verifying signature:', err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signatureHeader = request.headers.get('paddle-signature');

  // Verify the webhook signature
  const isValid = verifyPaddleSignature(
    body,
    signatureHeader,
    process.env.PADDLE_WEBHOOK_SECRET!
  );

  if (!isValid) {
    console.error('Webhook signature verification failed');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  // Parse the event
  let event: {
    event_id: string;
    event_type: string;
    occurred_at: string;
    data: Record<string, unknown>;
  };

  try {
    event = JSON.parse(body);
  } catch (err) {
    console.error('Failed to parse webhook payload:', err);
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  // Handle the event based on type
  switch (event.event_type) {
    case 'subscription.created':
      console.log('Subscription created:', event.data.id);
      // TODO: Provision access, send welcome email, etc.
      break;

    case 'subscription.activated':
      console.log('Subscription activated:', event.data.id);
      // TODO: Grant full access after first payment
      break;

    case 'subscription.canceled':
      console.log('Subscription canceled:', event.data.id);
      // TODO: Revoke access, send retention email, etc.
      break;

    case 'subscription.paused':
      console.log('Subscription paused:', event.data.id);
      // TODO: Limit access, send pause confirmation
      break;

    case 'subscription.resumed':
      console.log('Subscription resumed:', event.data.id);
      // TODO: Restore access, send welcome back email
      break;

    case 'transaction.completed':
      console.log('Transaction completed:', event.data.id);
      // TODO: Fulfill order, send receipt, etc.
      break;

    case 'transaction.payment_failed':
      console.log('Transaction payment failed:', event.data.id);
      // TODO: Notify customer, update status, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }

  // Return 200 to acknowledge receipt (respond within 5 seconds)
  return NextResponse.json({ received: true });
}
