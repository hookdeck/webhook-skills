// Generated with: fastspring-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify FastSpring webhook signature.
 *
 * FastSpring signs the exact raw request body with HMAC-SHA256 keyed on your
 * per-webhook "HMAC SHA256 Secret", base64-encodes the digest, and sends it in
 * the X-FS-Signature header. Verify once against the whole raw body.
 */
function verifyFastSpringWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    // Different lengths = invalid
    return false;
  }
}

interface FastSpringEvent {
  id: string;
  type: string;
  live?: boolean;
  processed?: boolean;
  created?: number;
  data?: Record<string, unknown>;
}

/**
 * Dispatch a single FastSpring event based on its `type`.
 */
function handleEvent(event: FastSpringEvent): void {
  switch (event.type) {
    case 'order.completed':
      console.log('Order completed:', event.id);
      // Your code: Provision access, fulfill, send receipt, etc.
      break;

    case 'order.failed':
      console.log('Order failed:', event.id);
      // Your code: Alert, retry payment flow, etc.
      break;

    case 'order.canceled':
      console.log('Order canceled:', event.id);
      // Your code: Revoke provisional access, etc.
      break;

    case 'subscription.activated':
      console.log('Subscription activated:', event.id);
      // Your code: Grant access, start entitlement, etc.
      break;

    case 'subscription.charge.completed':
      console.log('Subscription charge completed:', event.id);
      // Your code: Extend entitlement, record revenue, etc.
      break;

    case 'subscription.charge.failed':
      console.log('Subscription charge failed:', event.id);
      // Your code: Start dunning, notify customer, etc.
      break;

    case 'subscription.updated':
      console.log('Subscription updated:', event.id);
      // Your code: Sync plan/quantity changes, etc.
      break;

    case 'subscription.canceled':
      console.log('Subscription canceled:', event.id);
      // Your code: Schedule end-of-term downgrade, etc.
      break;

    case 'subscription.deactivated':
      console.log('Subscription deactivated:', event.id);
      // Your code: Revoke access, etc.
      break;

    case 'return.created':
      console.log('Return created:', event.id);
      // Your code: Reverse entitlement, adjust revenue, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event.type} (${event.id})`);
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-fs-signature');

  // Verify the signature once against the whole raw body
  if (!verifyFastSpringWebhook(body, signature, process.env.FASTSPRING_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let payload: { events?: FastSpringEvent[] };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];

  // Each POST batches multiple events - iterate and dispatch on each type.
  // Dedupe on event.id: automatic retries reuse the same id.
  for (const event of events) {
    handleEvent(event);
  }

  // Return 200 to mark every event in the batch processed (any status other than 200 or 202 is retried)
  return NextResponse.json({ received: true });
}
