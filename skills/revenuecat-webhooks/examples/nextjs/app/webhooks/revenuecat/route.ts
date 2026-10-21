// Generated with: revenuecat-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAuthorizationHeader,
  verifyRevenueCatSignature,
  type RevenueCatEvent,
  type RevenueCatWebhookBody,
} from '../../../lib/revenuecat-signature';

function handleEvent(event: RevenueCatEvent) {
  switch (event.type) {
    case 'TEST':
      // Sent from the dashboard's "Send test event" button.
      console.log('Test event received:', event.id);
      break;
    case 'INITIAL_PURCHASE':
      console.log(`Initial purchase of ${event.product_id} by ${event.app_user_id}`);
      break;
    case 'RENEWAL':
      console.log(`Renewal of ${event.product_id} by ${event.app_user_id}`);
      break;
    case 'CANCELLATION':
      // Auto-renew turned off or refunded. Access continues until EXPIRATION.
      console.log(`Cancellation for ${event.app_user_id} (reason: ${event.cancel_reason})`);
      break;
    case 'UNCANCELLATION':
      console.log(`Uncancellation for ${event.app_user_id}`);
      break;
    case 'NON_RENEWING_PURCHASE':
      console.log(`Non-renewing purchase of ${event.product_id} by ${event.app_user_id}`);
      break;
    case 'SUBSCRIPTION_PAUSED':
      // Don't revoke access here; wait for EXPIRATION with reason SUBSCRIPTION_PAUSED.
      console.log(`Subscription pause scheduled for ${event.app_user_id}`);
      break;
    case 'EXPIRATION':
      // Revoke access.
      console.log(`Expiration for ${event.app_user_id} (reason: ${event.expiration_reason})`);
      break;
    case 'BILLING_ISSUE':
      // A charge failed; the subscription has not expired yet.
      console.log(`Billing issue for ${event.app_user_id}`);
      break;
    case 'PRODUCT_CHANGE':
      // The new product may not be in effect yet.
      console.log(`Product change for ${event.app_user_id}: ${event.product_id} -> ${event.new_product_id}`);
      break;
    case 'SUBSCRIPTION_EXTENDED':
    case 'REFUND_REVERSED':
    case 'INVOICE_ISSUANCE':
    case 'TRANSFER':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
    case 'VIRTUAL_CURRENCY_TRANSACTION':
    case 'EXPERIMENT_ENROLLMENT':
    case 'PURCHASE_REDEEMED':
    case 'PRICE_INCREASE_CONSENT_REQUIRED':
    case 'PRICE_INCREASE_CONSENT_APPROVED':
      console.log(`${event.type}:`, event.id);
      break;
    default:
      // RevenueCat may add event types without an API version bump. Answer 200
      // so they aren't retried.
      console.log(`Unhandled RevenueCat event type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH;

  if (!secret && !expectedAuth) {
    console.error('Set REVENUECAT_WEBHOOK_SECRET and/or REVENUECAT_WEBHOOK_AUTH');
    return NextResponse.json({ error: 'Webhook verification not configured' }, { status: 500 });
  }

  // Read the raw body: the signature covers these exact bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());

  // 1. Static Authorization header (when configured on the integration).
  if (expectedAuth) {
    const auth = verifyAuthorizationHeader(request.headers.get('authorization'), expectedAuth);
    if (!auth.valid) {
      console.error('RevenueCat webhook authorization failed:', auth.error);
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
  }

  // 2. HMAC signature (when "HMAC webhook signing" is enabled).
  if (secret) {
    const verification = verifyRevenueCatSignature(
      rawBody,
      request.headers.get('x-revenuecat-webhook-signature'),
      secret
    );
    if (!verification.valid) {
      console.error('RevenueCat webhook verification failed:', verification.error);
      return NextResponse.json({ error: verification.error }, { status: 401 });
    }
  }

  // 3. Parse only after verifying the raw body.
  let payload: RevenueCatWebhookBody;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  const event = payload?.event;
  if (!event || typeof event.type !== 'string') {
    return NextResponse.json({ error: 'Missing event' }, { status: 400 });
  }

  // In production: dedupe on event.id (retries reuse it), store the event,
  // return 200, then process asynchronously.
  handleEvent(event);

  // RevenueCat treats any status other than 200 as a failure.
  return NextResponse.json({ received: true }, { status: 200 });
}
