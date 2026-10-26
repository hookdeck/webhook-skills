// Generated with: jobber-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface JobberWebhookEvent {
  topic: string;
  appId: string;
  accountId: string;
  itemId: string;
  occurredAt: string;
}

/**
 * Verify a Jobber webhook signature.
 *
 * Jobber sends `X-Jobber-Hmac-SHA256`: the base64 HMAC-SHA256 of the RAW request
 * body, keyed with your app's OAuth client secret. The header is compared as a
 * string (no base64 decoding) so lenient decoding can't accept altered values.
 */
function verifyJobberSignature(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string | undefined
): boolean {
  if (!signatureHeader || !clientSecret) return false;

  const expected = Buffer.from(
    crypto.createHmac('sha256', clientSecret).update(rawBody, 'utf8').digest('base64'),
    'utf8'
  );
  const received = Buffer.from(signatureHeader, 'utf8');

  // timingSafeEqual throws on length mismatch, so check first.
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

/**
 * Handle a Jobber webhook event. Payloads are thin: use `itemId` to fetch the
 * object through the Jobber GraphQL API. Delivery is at-least-once, so dedupe
 * (e.g. on accountId + itemId + topic + occurredAt).
 */
function handleEvent(event: JobberWebhookEvent): void {
  switch (event.topic) {
    case 'CLIENT_CREATE':
      console.log('Client created:', event.itemId);
      // TODO: query the client by itemId via GraphQL and sync it to your CRM
      break;
    case 'INVOICE_UPDATE':
      console.log('Invoice updated:', event.itemId);
      // TODO: query the invoice by itemId via GraphQL and reconcile status/payments
      break;
    case 'APP_CONNECT':
      console.log('App connected:', event.accountId);
      // TODO: store the account link for this accountId
      break;
    case 'APP_DISCONNECT':
      console.log('App disconnected:', event.accountId);
      // TODO: revoke tokens and clean up data for this accountId (required for Marketplace apps)
      break;
    default:
      console.log(`Unhandled topic: ${event.topic} (${event.itemId})`);
  }
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do NOT parse first).
  const rawBody = await request.text();
  const signature = request.headers.get('x-jobber-hmac-sha256');

  if (!verifyJobberSignature(rawBody, signature, process.env.JOBBER_CLIENT_SECRET)) {
    console.error('Jobber signature verification failed');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let event: JobberWebhookEvent | undefined;
  try {
    event = JSON.parse(rawBody)?.data?.webHookEvent;
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (!event || !event.topic) {
    return new NextResponse('Missing webHookEvent', { status: 400 });
  }

  handleEvent(event);

  // Jobber expects a response within 1 second: do heavy work asynchronously.
  return new NextResponse('OK', { status: 200 });
}
