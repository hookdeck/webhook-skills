// Generated with: recurly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRecurlySignature, verifyBasicAuth } from './verify';

// Ensure this route runs on the Node.js runtime (uses node:crypto).
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Read the RAW body — the signature is computed over the exact bytes Recurly
  // sent, so never parse before verifying.
  const rawBody = await request.text();

  // 1. Optional HTTP Basic Auth (defense in depth; required to secure XML endpoints)
  if (
    !verifyBasicAuth(
      request.headers.get('authorization'),
      process.env.RECURLY_WEBHOOK_USER,
      process.env.RECURLY_WEBHOOK_PASSWORD
    )
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Verify the signature over the raw body
  const signature = request.headers.get('recurly-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing recurly-signature header' }, { status: 400 });
  }
  if (!verifyRecurlySignature(rawBody, signature, process.env.RECURLY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 3. Parse AFTER verification. Classic JSON notifications use the notification
  //    type as the single top-level key, wrapping the related objects.
  let notification: Record<string, any>;
  try {
    notification = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const notificationType = Object.keys(notification)[0];
  const data = notification[notificationType] || {};

  // 4. Dispatch on the notification type
  switch (notificationType) {
    case 'new_subscription_notification':
      console.log('New subscription:', data.subscription?.uuid);
      // TODO: provision access, send welcome email, etc.
      break;

    case 'updated_subscription_notification':
      console.log('Subscription updated:', data.subscription?.uuid);
      // TODO: adjust entitlements for the new plan/quantity, etc.
      break;

    case 'canceled_subscription_notification':
      console.log('Subscription canceled:', data.subscription?.uuid);
      // TODO: schedule access removal at term end, send retention email, etc.
      break;

    case 'expired_subscription_notification':
      console.log('Subscription expired:', data.subscription?.uuid);
      // TODO: revoke access, etc.
      break;

    case 'renewed_subscription_notification':
      console.log('Subscription renewed:', data.subscription?.uuid);
      // TODO: extend access for the new term, etc.
      break;

    case 'successful_payment_notification':
      console.log('Payment succeeded:', data.transaction?.uuid);
      // TODO: record payment, send receipt, etc.
      break;

    case 'failed_payment_notification':
      console.log('Payment failed:', data.transaction?.uuid);
      // TODO: notify customer, trigger dunning, etc.
      break;

    default:
      console.log(`Unhandled notification type: ${notificationType}`);
  }

  // Optional: confirm state with the Recurly API before acting on it. Webhooks
  // can arrive out of order, so fetch the object to read its current state:
  //
  //   import { Client } from 'recurly';
  //   const client = new Client(process.env.RECURLY_API_KEY!);
  //   const sub = await client.getSubscription('uuid-' + data.subscription.uuid);

  // Acknowledge receipt quickly; do heavy work asynchronously.
  return NextResponse.json({ received: true });
}
