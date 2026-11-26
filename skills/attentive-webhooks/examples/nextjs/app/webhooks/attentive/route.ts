// Generated with: attentive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Attentive webhook signature.
 *
 * Attentive signs the raw request body with HMAC-SHA256 keyed on your
 * per-webhook signing key and sends the hex-encoded digest in the
 * `x-attentive-hmac-sha256` header. There is no timestamp in the signature.
 */
function verifyAttentiveWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Compute the expected signature over the raw body, hex-encoded
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guards against non-hex / wrong-length input
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification (do NOT parse first)
  const body = await request.text();
  const signature = request.headers.get('x-attentive-hmac-sha256');

  // Verify webhook signature before trusting the payload
  if (!verifyAttentiveWebhook(body, signature, process.env.ATTENTIVE_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);
  const { type, timestamp, subscriber } = payload;

  console.log(`Received ${type} event at ${new Date(timestamp).toISOString()}`);

  // Handle the event based on its type
  switch (type) {
    case 'sms.subscribed':
      console.log('SMS opt-in:', subscriber?.phone);
      // Your code: Sync opt-in state, trigger welcome flow, etc.
      break;

    case 'sms.unsubscribed':
      console.log('SMS opt-out:', subscriber?.phone);
      // Your code: Suppress sends, update CRM consent, etc.
      break;

    case 'sms.sent':
      console.log('SMS sent to:', subscriber?.phone);
      // Your code: Delivery logging, analytics, etc.
      break;

    case 'sms.inbound_message':
      console.log('Inbound SMS from:', subscriber?.phone);
      // Your code: Support routing, keyword automations, etc.
      break;

    case 'sms.message_link_click':
      console.log('SMS link click:', subscriber?.phone);
      // Your code: Attribution, engagement scoring, etc.
      break;

    case 'email.subscribed':
      console.log('Email opt-in:', subscriber?.email);
      // Your code: Sync opt-in state, etc.
      break;

    case 'email.unsubscribed':
      console.log('Email opt-out:', subscriber?.email);
      // Your code: Suppress sends, update consent, etc.
      break;

    case 'email.sent':
      console.log('Email sent to:', subscriber?.email);
      // Your code: Delivery logging, etc.
      break;

    case 'email.opened':
      console.log('Email opened by:', subscriber?.email);
      // Your code: Engagement scoring, re-targeting, etc.
      break;

    case 'email.message_link_click':
      console.log('Email link click:', subscriber?.email);
      // Your code: Attribution, engagement scoring, etc.
      break;

    case 'custom_attribute.set':
      console.log('Custom attribute set for:', subscriber?.phone || subscriber?.email);
      // Your code: Sync enriched data to your systems, etc.
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
