// Generated with: stitch-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

type GraphQLNode = {
  id?: string;
  externalReference?: string;
  state?: { __typename?: string };
  status?: { __typename?: string };
  paymentConfirmation?: { __typename?: string } | null;
};

type StitchEvent = {
  // Present on payment-consent-request, transaction and collection payloads
  id?: string;
  type?: string;
  datetime?: string;
  data?: {
    id?: string;
    status?: string;
    // GraphQL shape used by payment, payment.confirmation, refund, disbursement
    client?: {
      paymentInitiationRequests?: { node?: GraphQLNode };
      refunds?: { node?: GraphQLNode };
      disbursements?: { node?: GraphQLNode };
    };
  };
};

// Stitch sends two payload shapes: some carry a top-level `type`, the
// GraphQL-shaped ones don't, so derive the type from the key under data.client.
function getEventType(event: StitchEvent): string {
  if (typeof event.type === 'string') return event.type;
  const client = event.data?.client;
  if (client?.paymentInitiationRequests) return 'payment'; // also payment.confirmation
  if (client?.refunds) return 'refund';
  if (client?.disbursements) return 'disbursement';
  return 'unknown';
}

export async function POST(request: Request) {
  const secret = process.env.STITCH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('STITCH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body; never JSON.parse before verifying.
  const rawBody = await request.text();

  try {
    // HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}`, compared against
    // every v1 entry in svix-signature, plus a 5-minute timestamp tolerance.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Stitch webhook verification failed:', message);
    const detail = /timestamp/i.test(message) ? 'Invalid timestamp' : 'Invalid signature';
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  // Verified: now it is safe to parse.
  let event: StitchEvent;
  try {
    event = JSON.parse(rawBody) as StitchEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = getEventType(event);
  const client = event.data?.client;
  console.log(`Received Stitch webhook ${svixId}: ${eventType}`);

  // Process idempotently: Svix may deliver the same message more than once.
  switch (eventType) {
    case 'payment': {
      const node = client?.paymentInitiationRequests?.node;
      console.log('Payment request update:', {
        id: node?.id,
        externalReference: node?.externalReference,
        state: node?.state?.__typename,
        confirmation: node?.paymentConfirmation?.__typename,
      });
      // TODO: update the order from state / paymentConfirmation
      break;
    }
    case 'payment-consent-request':
      console.log('Consent update:', { id: event.data?.id, status: event.data?.status });
      // TODO: store/revoke the consent (card token, DebiCheck mandate, ...)
      break;
    case 'transaction':
      console.log('Transaction update:', { id: event.data?.id, status: event.data?.status });
      // TODO: mark the recurring charge SUCCESS / FAILURE / CANCELLED
      break;
    case 'collection':
      console.log('Collection update:', { id: event.data?.id, status: event.data?.status });
      // TODO: reconcile the batch collection
      break;
    case 'refund': {
      const node = client?.refunds?.node;
      console.log('Refund update:', { id: node?.id, status: node?.status?.__typename });
      // TODO: update refund status
      break;
    }
    case 'disbursement': {
      const node = client?.disbursements?.node;
      console.log('Disbursement update:', { id: node?.id, status: node?.status?.__typename });
      // TODO: update payout status
      break;
    }
    default:
      console.log('Unhandled Stitch event type:', eventType);
  }

  return NextResponse.json({ received: true, type: eventType }, { status: 200 });
}
