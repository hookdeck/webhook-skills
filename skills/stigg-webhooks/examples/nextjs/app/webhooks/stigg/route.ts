// Generated with: stigg-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Stigg payloads share an envelope; these are the fields used below
type StiggEvent = {
  type: string;
  messageId?: string;
  id?: string;
  plan?: { id?: string };
  customer?: { id?: string };
  [key: string]: unknown;
};

/**
 * Verify a Stigg webhook.
 *
 * Stigg does NOT sign payloads yet (HMAC is on its roadmap). Each event carries
 * the webhook secret in the `Stigg-Webhooks-Secret` header; it must match the
 * secret on the webhook details page. Both sides are hashed so
 * crypto.timingSafeEqual always receives equal-length buffers.
 */
export function verifyStiggSecret(header: string | null, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const a = crypto.createHash('sha256').update(header).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

function handleStiggEvent(event: StiggEvent) {
  // The event name is in `type`; `messageId` is unique per event (use it to de-duplicate)
  switch (event.type) {
    case 'customer.created':
      console.log(`Customer created: ${event.id}`);
      // TODO: Create CRM record / billing profile
      break;
    case 'customer.updated':
      console.log(`Customer updated: ${event.id}`);
      break;
    case 'customer.deleted':
      console.log(`Customer deleted: ${event.id}`);
      break;
    case 'customer.payment_failed':
      console.log(`Payment failed for customer: ${event.customer?.id}`);
      // TODO: Start dunning
      break;
    case 'subscription.created':
      console.log(`Subscription created: ${event.id} (${event.plan?.id})`);
      // TODO: Provision access
      break;
    case 'subscription.updated':
      console.log(`Subscription updated: ${event.id}`);
      break;
    case 'subscription.canceled':
    case 'subscription.expired':
      console.log(`${event.type}: ${event.id}`);
      // TODO: Schedule offboarding / revoke access
      break;
    case 'subscription.trial_started':
    case 'subscription.trial_converted':
    case 'subscription.trial_expired':
    case 'subscription.trial.ends_soon':
      console.log(`Trial event ${event.type}: ${event.id}`);
      break;
    case 'entitlements.updated':
      console.log(`Entitlements updated for customer: ${event.customer?.id}`);
      // TODO: Recompute access gates
      break;
    case 'entitlement.usage_exceeded':
      console.log(`Entitlement usage exceeded: ${event.messageId}`);
      break;
    default:
      console.log(`Unhandled Stigg event: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.STIGG_WEBHOOK_SECRET;

  // Fail closed: without a configured secret there is nothing to check.
  if (!secret) {
    console.error('STIGG_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  if (!verifyStiggSecret(request.headers.get('stigg-webhooks-secret'), secret)) {
    console.error('Stigg webhook authentication failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read the raw text for any content type; there is no body signature, so parse JSON ourselves
  let event: StiggEvent;
  try {
    event = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  handleStiggEvent(event);

  // Respond 2xx within 30 seconds; Stigg retries on errors and timeouts
  return NextResponse.json({ received: true });
}
