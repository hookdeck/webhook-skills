// Generated with: klaviyo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface KlaviyoEvent {
  external_id: string;
  topic: string;
  payload: Record<string, unknown>;
}

/**
 * Verify a Klaviyo system webhook signature.
 *
 * Klaviyo signs the raw request body with the Klaviyo-Timestamp header value
 * appended: HMAC-SHA256(secret, rawBody + timestamp), hex-encoded. The result
 * is sent in the Klaviyo-Signature header.
 */
function verifyKlaviyoWebhook(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)     // raw body FIRST
    .update(timestamp)   // Klaviyo-Timestamp appended
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false; // different lengths = invalid
  }
}

function handleEvent(event: KlaviyoEvent): void {
  switch (event.topic) {
    case 'event:klaviyo.opened_email':
      console.log('Email opened:', event.external_id);
      break;
    case 'event:klaviyo.clicked_email':
      console.log('Email clicked:', event.external_id);
      break;
    case 'event:klaviyo.bounced_email':
      console.log('Email bounced:', event.external_id);
      break;
    case 'event:klaviyo.marked_email_as_spam':
      console.log('Email marked as spam:', event.external_id);
      break;
    case 'event:klaviyo.unsubscribed_from_email_marketing':
      console.log('Unsubscribed from email marketing:', event.external_id);
      break;
    case 'event:klaviyo.sent_sms':
      console.log('SMS sent:', event.external_id);
      break;
    case 'event:klaviyo.received_sms':
      console.log('Inbound SMS received:', event.external_id);
      break;
    case 'event:klaviyo.submitted_review':
      console.log('Review submitted:', event.external_id);
      break;
    default:
      console.log(`Unhandled topic: ${event.topic}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse first)
  const rawBody = await request.text();
  const signature = request.headers.get('klaviyo-signature');
  const timestamp = request.headers.get('klaviyo-timestamp');

  if (!signature || !timestamp) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  if (!verifyKlaviyoWebhook(rawBody, timestamp, signature, process.env.KLAVIYO_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Safe to parse now that the signature is verified
  const body = JSON.parse(rawBody);

  for (const event of (body.data as KlaviyoEvent[]) || []) {
    handleEvent(event);
  }

  // Acknowledge quickly with a 2xx
  return NextResponse.json({ received: true });
}
