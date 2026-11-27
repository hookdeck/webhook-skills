// Generated with: orb-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const TOLERANCE_SECONDS = 300; // 5 minutes, the tolerance Orb's SDKs use

/**
 * Verify an Orb webhook signature.
 *
 * Orb signs `v1:{X-Orb-Timestamp}:{rawBody}` with HMAC-SHA256 using your
 * per-endpoint signing secret. The hex digest arrives in `X-Orb-Signature`
 * prefixed with `v1=`. During a secret rotation the header can carry several
 * space-separated signatures; the delivery is valid if any one matches.
 */
export function verifyOrbSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestamp: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !timestamp || !secret) return false;

  const expected = Buffer.from(
    crypto
      .createHmac('sha256', secret)
      .update(`v1:${timestamp}:${rawBody}`)
      .digest('hex'),
    'hex'
  );

  return signatureHeader.split(' ').some((entry) => {
    const provided = entry.startsWith('v1=') ? entry.slice(3) : entry;
    try {
      return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), expected);
    } catch {
      return false;
    }
  });
}

export function isTimestampFresh(
  timestamp: string | null,
  toleranceSeconds: number = TOLERANCE_SECONDS
): boolean {
  if (!timestamp) return false;
  const deliveredAt = Date.parse(timestamp);
  if (Number.isNaN(deliveredAt)) return false;
  const skew = Math.abs(Date.now() - deliveredAt) / 1000;
  return skew <= toleranceSeconds;
}

interface OrbResource {
  id?: string;
  [key: string]: unknown;
}

interface OrbEvent {
  id: string;
  type: string;
  created_at?: string;
  /**
   * The style this payload was rendered in, set per endpoint. Absent on
   * payloads created before payload styles existed, which read as 'expanded'.
   */
  payload_style?: 'standard' | 'expanded';
  /**
   * Only the extra fields specific to this event — empty for many types, and
   * never the resource ID.
   */
  properties?: Record<string, unknown>;
  /**
   * Orb serializes the resource under a key matching the `resource_name`
   * prefix of `type`. The resource ID lives here.
   */
  customer?: OrbResource;
  subscription?: OrbResource;
  invoice?: OrbResource;
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-orb-signature');
  const timestamp = request.headers.get('x-orb-timestamp');
  const secret = process.env.ORB_WEBHOOK_SECRET ?? '';

  if (!signatureHeader || !timestamp) {
    return NextResponse.json(
      { error: 'Missing Orb signature headers' },
      { status: 400 }
    );
  }

  if (!isTimestampFresh(timestamp)) {
    return NextResponse.json(
      { error: 'Timestamp outside tolerance' },
      { status: 400 }
    );
  }

  if (!verifyOrbSignature(rawBody, signatureHeader, timestamp, secret)) {
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  let event: OrbEvent;
  try {
    event = JSON.parse(rawBody) as OrbEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Standard payloads summarize subscriptions and invoices; expanded payloads
  // carry them in full. Retries of older events keep the style they were
  // created with, so a handler can see both. See references/overview.md.
  const styleNote = event.payload_style ?? 'expanded';

  switch (event.type) {
    case 'customer.created':
      console.log('Customer created:', event.customer?.id, `(${styleNote})`);
      // Your code: Sync customer to CRM
      break;

    case 'customer.credit_balance_dropped':
      console.log(
        'Credit balance dropped for:',
        event.customer?.id,
        'threshold:',
        event.properties?.balance_threshold
      );
      // Your code: Trigger top-up reminder
      break;

    case 'subscription.created':
      console.log('Subscription created:', event.subscription?.id);
      // Your code: Provision access
      break;

    case 'subscription.started':
      console.log('Subscription started:', event.subscription?.id);
      // Your code: Activate entitlements
      break;

    case 'subscription.ended':
      console.log('Subscription ended:', event.subscription?.id);
      // Your code: Revoke access
      break;

    case 'subscription.plan_changed':
      console.log(
        'Subscription plan changed:',
        event.subscription?.id,
        'from plan:',
        event.properties?.previous_plan_id
      );
      // Your code: Update entitlements
      break;

    case 'subscription.usage_exceeded':
      console.log(
        'Usage exceeded for:',
        event.subscription?.id,
        'metric:',
        event.properties?.billable_metric_id
      );
      // Your code: Notify customer / throttle
      break;

    case 'invoice.issued':
      // A standard payload omits line items — fetch the invoice if you need them.
      console.log('Invoice issued:', event.invoice?.id, `(${styleNote})`);
      // Your code: Record receivable, email invoice
      break;

    case 'invoice.payment_succeeded':
      console.log(
        'Invoice paid:',
        event.invoice?.id,
        'via:',
        event.properties?.payment_provider
      );
      // Your code: Mark paid internally
      break;

    case 'invoice.payment_failed':
      console.log(
        'Invoice payment failed:',
        event.invoice?.id,
        'via:',
        event.properties?.payment_provider
      );
      // Your code: Start dunning
      break;

    case 'data_exports.transfer_success':
      console.log('Data export delivered:', event.id);
      // Your code: Kick off downstream ETL
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
