// Generated with: lithic-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import Lithic from 'lithic';

// Lithic webhooks follow the Standard Webhooks signature layout.
// `lithic.webhooks.unwrap(rawBody, headers, secret)` verifies the
// `webhook-signature` HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{rawBody}`,
// enforces a ~5-minute timestamp tolerance (the library's default), and returns
// the parsed event.
// The API key is only used to call the Lithic API; a placeholder keeps the
// client constructable for a receive-only endpoint.
const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY || 'placeholder-not-used-for-webhooks',
  webhookSecret: process.env.LITHIC_WEBHOOK_SECRET,
});

// A flat body: `event_type` plus the fields of the resource for that event type.
interface LithicEvent {
  event_type?: string;
  token?: string;
  card_token?: string;
  data?: { token: string }[];
}

export async function POST(request: NextRequest) {
  // Read the RAW body — verification must run against the exact bytes signed.
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);
  const secret = process.env.LITHIC_WEBHOOK_SECRET;

  let event: LithicEvent;
  try {
    event = lithic.webhooks.unwrap(rawBody, headers, secret) as LithicEvent;
  } catch (err) {
    console.error('Lithic webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // The body is the resource object with `event_type` added at the top level.
  // There is no event id in the body: the `webhook-id` header is the event token,
  // so deduplicate on that header, not on `token` (a card_transaction.updated
  // body's `token` is the transaction's, shared by every event on it).
  switch (event.event_type) {
    case 'card.created':
      console.log('Card created:', event.card_token);
      // Your code: Provision the new card in your system
      break;

    case 'card.updated':
      console.log('Card updated:', event.card_token);
      // Your code: Sync card state (e.g. PAUSED/CLOSED)
      break;

    case 'card_transaction.updated':
      console.log('Card transaction updated:', event.token);
      // Your code: Reconcile authorization / clearing state
      break;

    case 'payment_transaction.created':
      console.log('Payment transaction created:', event.token);
      // Your code: Record incoming ACH / wire payment
      break;

    case 'payment_transaction.updated':
      console.log('Payment transaction updated:', event.token);
      // Your code: Update payment status (settled, returned)
      break;

    case 'dispute.updated':
      console.log('Dispute updated:', event.token);
      // Your code: Progress the dispute workflow
      break;

    case 'balance.updated':
      console.log('Balances updated for financial accounts:', event.data?.map((b) => b.token));
      // Your code: Refresh cached balances
      break;

    case 'three_ds_authentication.created':
      console.log('3DS authentication created:', event.token);
      // Your code: Handle challenge / decisioning
      break;

    default:
      console.log('Unhandled event type:', event.event_type);
  }

  // Acknowledge quickly so Lithic does not retry.
  return NextResponse.json({ received: true });
}
