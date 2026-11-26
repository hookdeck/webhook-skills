// Generated with: faundit-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface FaunditData {
  id: number;
  timestamp: string;
  status: string;
  locationID: string;
}

/**
 * Verify a Faundit webhook signature (current v1 scheme).
 *
 * Faundit signs "v1:<timestamp>:<body>" with HMAC-SHA256 (hex) and sends the
 * result in the X-Faundit-Signature-Next header. timestamp is the value of the
 * X-Faundit-Timestamp header; body is the raw, unparsed request body.
 */
function verifyFaunditWebhook(
  rawBody: string,
  timestamp: string | null,
  signatureNext: string | null,
  secret: string
): boolean {
  if (!signatureNext || !timestamp) {
    return false;
  }

  const signedContent = `v1:${timestamp}:${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureNext, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse first)
  const body = await request.text();
  const timestamp = request.headers.get('x-faundit-timestamp');
  // Prefer the current v1 header. The deprecated v0 header (X-Faundit-Signature)
  // signs only the timestamp and is not used here.
  const signatureNext = request.headers.get('x-faundit-signature-next');

  if (!verifyFaunditWebhook(body, timestamp, signatureNext, process.env.FAUNDIT_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  const payload = JSON.parse(body);
  const eventType = payload['event-type'] as string;
  const data = (payload.data || {}) as FaunditData;

  console.log(`Received ${eventType} event (id: ${data.id}, location: ${data.locationID})`);

  // Handle the event based on its type. The granular status is data.status.
  switch (eventType) {
    case 'item-status':
      handleItemStatus(data);
      break;

    case 'request-status':
      handleRequestStatus(data);
      break;

    default:
      console.log(`Unhandled event-type: ${eventType}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}

/**
 * Handle an item-status event. data.status is one of:
 * contact-missing, waiting-response, wrong-owner, pickup-by-guest, left-behind,
 * finished, shipment-paid, pickup-scheduled, in-route, delivered, deleted,
 * expired, anonymized
 */
function handleItemStatus(data: FaunditData) {
  switch (data.status) {
    case 'pickup-scheduled':
      console.log(`Item ${data.id} pickup scheduled`);
      // Your code: notify the owner, prepare fulfillment
      break;
    case 'in-route':
      console.log(`Item ${data.id} is in route`);
      // Your code: update tracking
      break;
    case 'delivered':
      console.log(`Item ${data.id} delivered`);
      // Your code: close the case with the owner
      break;
    case 'finished':
      console.log(`Item ${data.id} finished`);
      break;
    case 'expired':
      console.log(`Item ${data.id} expired`);
      break;
    default:
      console.log(`Item ${data.id} status: ${data.status}`);
  }
}

/**
 * Handle a request-status event. data.status is one of:
 * registered, awaiting-guest-response, not-found, resolved, deleted,
 * expired, anonymized
 */
function handleRequestStatus(data: FaunditData) {
  switch (data.status) {
    case 'registered':
      console.log(`Request ${data.id} registered`);
      // Your code: acknowledge the lost-item claim
      break;
    case 'resolved':
      console.log(`Request ${data.id} resolved`);
      // Your code: notify the customer their item was matched
      break;
    case 'not-found':
      console.log(`Request ${data.id} not found`);
      break;
    case 'expired':
      console.log(`Request ${data.id} expired`);
      break;
    default:
      console.log(`Request ${data.id} status: ${data.status}`);
  }
}
