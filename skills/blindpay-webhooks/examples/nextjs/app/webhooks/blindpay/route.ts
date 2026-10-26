// Generated with: blindpay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// BlindPay delivers webhooks through Svix:
//   svix-id         message ID (stable across retries)
//   svix-timestamp  Unix seconds when the message was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface BlindPayEvent {
  webhook_event: string; // e.g. "payin.complete"
  [key: string]: any; // flat: the resource's own fields follow webhook_event
}

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify a BlindPay delivery with the official Svix library. Svix checks the
 * timestamp (fixed 5-minute window), recomputes the HMAC over the raw body,
 * and compares in constant time against every `v1,` entry.
 *
 * The 5-minute window also rejects late Hookdeck retries and replays, which
 * keep the original timestamp. See references/verification.md for a manual
 * verifier without the window.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so the JSON is
 * parsed here after verification succeeds.
 */
function verifyBlindPayWebhook(rawBody: string, headers: SvixHeaders, secret: string): BlindPayEvent {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as BlindPayEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// svix-id is the same on every retry of a message.
const processedMessageIds = new Set<string>();

function handleEvent(event: BlindPayEvent): void {
  const eventType = event.webhook_event;

  switch (eventType) {
    // --- Customers ---------------------------------------------------------
    case 'customer.new':
    case 'customer.update':
    case 'customer.delete':
      console.log(`${eventType}: customer ${event.id} (${event.kyc_status ?? event.status ?? 'n/a'})`);
      break;
    case 'tos.accept':
      console.log(`Terms of service accepted: ${event.id}`);
      break;

    // --- Bank accounts and wallets -------------------------------------------
    case 'bankAccount.new':
      console.log(`Bank account added: ${event.id}`);
      break;
    case 'blockchainWallet.new':
    case 'blockchainWallet.update':
    case 'wallet.new':
    case 'wallet.update':
      console.log(`${eventType}: ${event.id}`);
      break;
    case 'wallet.inbound':
      // Funds arrived in a wallet.
      console.log(`Inbound wallet funds: ${event.id}`);
      break;

    // --- Payins --------------------------------------------------------------
    case 'payin.new':
    case 'payin.update':
      console.log(`${eventType}: payin ${event.id} is ${event.status}`);
      break;
    case 'payin.complete':
      // Carries amounts, fees, bank details and tracking objects.
      console.log(`Payin completed: ${event.id} for customer ${event.customer_id}`);
      break;

    // --- Payouts -------------------------------------------------------------
    case 'payout.new':
    case 'payout.update':
      console.log(`${eventType}: payout ${event.id} is ${event.status}`);
      break;
    case 'payout.complete':
      console.log(`Payout completed: ${event.id}`);
      break;

    // --- Virtual accounts ----------------------------------------------------
    case 'virtualAccount.new':
    case 'virtualAccount.complete':
      console.log(`${eventType}: ${event.id}`);
      break;

    // --- Transfers -----------------------------------------------------------
    case 'transfer.new':
    case 'transfer.update':
    case 'transfer.complete':
      console.log(`${eventType}: transfer ${event.id} is ${event.status}`);
      break;

    // --- Limit increases and payables ----------------------------------------
    case 'limitIncrease.new':
    case 'limitIncrease.update':
    case 'payable.new':
    case 'payable.update':
    case 'payable.complete':
      console.log(`${eventType}: ${event.id}`);
      break;

    default:
      console.log(`Unhandled BlindPay event type: ${eventType}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.BLINDPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BLINDPAY_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // Raw body: the signature covers the exact bytes, so never verify request.json().
  const rawBody = await request.text();

  let event: BlindPayEvent;
  try {
    event = verifyBlindPayWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('BlindPay webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (retries reuse svix-id) — acknowledge with 200.
  if (processedMessageIds.has(svixId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast. In production, enqueue the event and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(svixId);
  } catch (err) {
    console.error('Error handling BlindPay event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
