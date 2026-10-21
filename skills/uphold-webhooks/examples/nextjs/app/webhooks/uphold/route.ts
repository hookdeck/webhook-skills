// Generated with: uphold-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// Uphold Enterprise (Core API) webhooks are delivered by Svix, white-labelled:
//   webhook-id         unique message id (same value on every retry)
//   webhook-timestamp  Unix seconds when the delivery was sent
//   webhook-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint secret after its `whsec_` prefix.
// Uphold defers to Svix's verification guide, so we use the official `svix`
// SDK, which accepts the unbranded webhook-* header names directly.
// ---------------------------------------------------------------------------

export interface UpholdEvent {
  id: string; // Uphold event id (UUID) — not the webhook-id header
  type: string; // e.g. "core.transaction.status-changed"
  createdAt: string;
  data: Record<string, any>;
}

type UpholdHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify an Uphold delivery, then parse it. The SDK checks the timestamp
 * (5-minute tolerance), recomputes the HMAC over the raw body, and compares in
 * constant time against every `v1,` entry in webhook-signature.
 *
 * Note: in svix 2.x, `Webhook.verify()` returns nothing (it only throws), so
 * parse the raw body yourself once verification has passed.
 */
function verifyUpholdWebhook(rawBody: string, headers: UpholdHeaders, secret: string): UpholdEvent {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as UpholdEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production —
// Svix delivers at least once and retries failed deliveries for up to 24 hours.
const processedEventIds = new Set<string>();

function handleEvent(event: UpholdEvent): void {
  const { type, data } = event;

  switch (type) {
    // --- Users --------------------------------------------------------------
    case 'core.user.created':
      console.log(`User created: ${data.user.id} (${data.user.type})`);
      break;
    case 'core.user.deleted':
      console.log(`User deleted: ${data.user.id}`);
      break;

    // --- Transactions -------------------------------------------------------
    case 'core.transaction.created':
      console.log(`Transaction created: ${data.transaction.id} (${data.transaction.status})`);
      break;
    case 'core.transaction.status-changed': {
      const tx = data.transaction;
      // status: processing | on-hold | completed | failed
      if (tx.status === 'completed') {
        console.log(`Transaction ${tx.id} completed: ${tx.destination?.amount} ${tx.destination?.asset}`);
      } else if (tx.status === 'failed' || tx.status === 'on-hold') {
        console.log(`Transaction ${tx.id} ${tx.status} (reason=${tx.statusDetails?.reason})`);
      } else {
        console.log(`Transaction ${tx.id} -> ${tx.status}`);
      }
      break;
    }

    // --- Accounts -----------------------------------------------------------
    case 'core.account.created':
    case 'core.account.archived':
    case 'core.account.unarchived':
      console.log(`${type}: account ${data.account.id} (${data.account.asset})`);
      break;
    case 'core.account.balance-changed':
      console.log(
        `Account ${data.account.id} balance: ${data.account.balance.available} available / ${data.account.balance.total} total ${data.account.asset}`
      );
      break;

    // --- External accounts (cards, banks, APMs, crypto) --------------------
    case 'core.external-account.created':
    case 'core.external-account.deleted':
      console.log(`${type}: external account ${data.externalAccount.id}`);
      break;
    case 'core.external-account.status-changed':
      console.log(`External account ${data.externalAccount.id} -> ${data.externalAccount.status}`);
      break;

    // --- Assets -------------------------------------------------------------
    case 'core.assets.cooldown-ended':
      console.log(`Cooldown ended for user ${data.userId}`);
      break;

    default:
      // KYC / KYB process events share one shape: { status, userId } (plus
      // associatedPersonId for associated-person events).
      // status: ok | failed | running | pending | exempt
      if (type.startsWith('core.kyc.') || type.startsWith('core.kyb.')) {
        console.log(`${type}: user ${data.userId} -> ${data.status}`);
      } else {
        console.log(`Unhandled Uphold event type: ${type}`);
      }
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.UPHOLD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('UPHOLD_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body — request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: UpholdEvent;
  try {
    event = verifyUpholdWebhook(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      },
      secret
    );
  } catch (err) {
    console.error('Uphold webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Dedupe on the Uphold event id (payload `id`). Retries also reuse the
  // webhook-id header, so either works as an idempotency key.
  if (processedEventIds.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast. In production, enqueue the event and process it
    // asynchronously so slow work doesn't cause timeouts and retries.
    handleEvent(event);
    processedEventIds.add(event.id);
  } catch (err) {
    console.error('Error handling Uphold event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
