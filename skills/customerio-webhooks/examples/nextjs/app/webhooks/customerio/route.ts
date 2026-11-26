// Generated with: customerio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Customer.io Reporting Webhook signature.
 *
 * Signed string is "v0:<X-CIO-Timestamp>:<raw body>", HMAC-SHA256, hex digest,
 * compared against the X-CIO-Signature header.
 */
function verifyCustomerIoWebhook(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingKey: string
): boolean {
  if (!timestamp || !signature) {
    return false;
  }

  // Build "v0:<timestamp>:<raw body>" and HMAC it.
  const expectedSignature = crypto
    .createHmac('sha256', signingKey)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false; // length mismatch or non-hex signature
  }
}

export async function POST(request: NextRequest) {
  // Get the RAW body for signature verification (do not parse first)
  const body = await request.text();
  const signature = request.headers.get('x-cio-signature');
  const timestamp = request.headers.get('x-cio-timestamp');

  // Verify webhook signature over the raw body
  if (!verifyCustomerIoWebhook(body, timestamp, signature, process.env.CUSTOMERIO_WEBHOOK_SIGNING_KEY!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);
  const { event_id: eventId, metric, data } = payload;
  // Customer.io's docs spell the in-app object type both `in_app` and `in-app`: accept both.
  const objectType = payload.object_type === 'in-app' ? 'in_app' : payload.object_type;
  // cio_subscription_preferences_changed carries the triggering channel in object_type,
  // so route it on metric alone.
  const route = metric === 'cio_subscription_preferences_changed' ? 'preferences' : objectType;

  // Customer.io has no dotted event name: identify events by object_type + metric.
  console.log(`Received ${objectType}.${metric} event (event_id: ${eventId})`);

  // Your code: de-dupe on event_id before processing (Customer.io retries for 7 days)

  switch (route) {
    case 'preferences':
      console.log(`Subscription preferences changed for customer ${data?.customer_id}`);
      // Your code: sync topic preferences (data.content, when Body content is on)
      break;

    case 'email':
      handleEmailMetric(metric, data);
      break;

    case 'sms':
      console.log(`SMS ${metric} to ${data?.recipient}`);
      // Your code: SMS analytics, two-way messaging, etc.
      break;

    case 'push':
      console.log(`Push ${metric} for customer ${data?.customer_id}`);
      // Your code: push engagement tracking, etc.
      break;

    case 'in_app':
      console.log(`In-app ${metric} for customer ${data?.customer_id}`);
      // Your code: in-app message engagement, etc.
      break;

    case 'customer':
      console.log(`Customer ${data?.customer_id} ${metric}`);
      // Your code: sync subscription state to your database, etc.
      break;

    case 'slack':
    case 'webhook':
    case 'whatsapp':
      console.log(`${objectType} ${metric}`);
      // Your code: channel-specific handling
      break;

    default:
      console.log(`Unhandled object_type: ${objectType} (${metric})`);
  }

  // Return 2xx within 4 seconds to acknowledge receipt
  return NextResponse.json({ received: true });
}

// Handle the metric for an email event (object_type === 'email')
function handleEmailMetric(metric: string, data: Record<string, unknown> | undefined) {
  switch (metric) {
    case 'delivered':
      console.log(`Email delivered to ${data?.recipient}`);
      break;
    case 'opened':
      console.log(`Email opened by ${data?.recipient}`);
      break;
    case 'clicked':
      console.log(`Email link clicked: ${data?.href} (link_id: ${data?.link_id})`);
      break;
    case 'bounced':
      console.log(`Email bounced for ${data?.recipient}: ${data?.failure_message}`);
      // Your code: suppress the address, alert, etc.
      break;
    case 'spammed':
      console.log(`Email marked as spam by ${data?.recipient}`);
      break;
    case 'converted':
      console.log(`Email conversion for customer ${data?.customer_id}`);
      break;
    default:
      console.log(`Email ${metric} for ${data?.recipient}`);
  }
}
