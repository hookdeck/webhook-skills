import { NextRequest } from 'next/server';
import { parse, InvalidSignatureError } from 'gocardless-nodejs/webhooks';
import type { Event } from 'gocardless-nodejs/types/Types';

// GoCardless signs the raw request body, so we must not let Next.js cache/parse it.
export const dynamic = 'force-dynamic';

/**
 * GoCardless webhook endpoint (App Router).
 *
 * GoCardless signs the RAW request body with HMAC-SHA256 (hex) in the
 * `Webhook-Signature` header. We read the body as text (the exact bytes GoCardless
 * signed) and let the official SDK's `parse()` verify it and return the events array.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Missing GOCARDLESS_WEBHOOK_SECRET environment variable');
    return new Response('Server misconfigured', { status: 500 });
  }

  // Read the RAW body BEFORE parsing JSON — required for signature verification.
  const rawBody = await request.text();
  const signature = request.headers.get('webhook-signature');

  if (!signature) {
    console.error('Missing Webhook-Signature header');
    return new Response('Missing signature', { status: 498 });
  }

  let events: Event[];
  try {
    // parse(body, webhookSecret, signatureHeader) — note the parameter order.
    events = parse(rawBody, secret, signature);
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      console.error('Invalid GoCardless webhook signature');
      return new Response('Invalid signature', { status: 498 });
    }
    console.error('Failed to parse GoCardless webhook:', err);
    return new Response('Bad request', { status: 400 });
  }

  // A webhook is a BATCH of events (up to 250). GoCardless retries the whole batch on
  // any non-2xx, so handlers must be idempotent on event.id.
  for (const event of events) {
    handleEvent(event);
  }

  // Acknowledge the batch with 204 No Content.
  return new Response(null, { status: 204 });
}

function handleEvent(event: Event): void {
  console.log(`Event ${event.id}: ${event.resource_type}.${event.action}`);
  const links = (event.links ?? {}) as Record<string, string | undefined>;

  switch (event.resource_type) {
    case 'payments':
      switch (event.action) {
        case 'confirmed':
          console.log(`Payment ${links.payment} confirmed`);
          // TODO: mark the payment as collected, fulfil the order, etc.
          break;
        case 'paid_out':
          console.log(`Payment ${links.payment} paid out`);
          break;
        case 'failed':
          console.log(`Payment ${links.payment} failed:`, event.details?.description);
          break;
        case 'cancelled':
          console.log(`Payment ${links.payment} cancelled`);
          break;
        case 'charged_back':
          console.log(`Payment ${links.payment} charged back`);
          break;
        default:
          console.log(`Unhandled payments action: ${event.action}`);
      }
      break;

    case 'mandates':
      switch (event.action) {
        case 'active':
          console.log(`Mandate ${links.mandate} is active`);
          break;
        case 'cancelled':
          console.log(`Mandate ${links.mandate} cancelled:`, event.details?.description);
          // TODO: suspend the customer's subscription/membership, etc.
          break;
        case 'failed':
          console.log(`Mandate ${links.mandate} failed`);
          break;
        case 'expired':
          console.log(`Mandate ${links.mandate} expired`);
          break;
        default:
          console.log(`Unhandled mandates action: ${event.action}`);
      }
      break;

    case 'payouts':
      if (event.action === 'paid') {
        console.log(`Payout ${links.payout} paid`);
        // TODO: reconcile the payout against collected payments.
      } else if (event.action === 'bounced') {
        console.log(`Payout ${links.payout} bounced`);
      } else {
        console.log(`Unhandled payouts action: ${event.action}`);
      }
      break;

    case 'refunds':
      if (event.action === 'paid') {
        console.log(`Refund ${links.refund} paid`);
      } else if (event.action === 'failed') {
        console.log(`Refund ${links.refund} failed`);
      } else {
        console.log(`Unhandled refunds action: ${event.action}`);
      }
      break;

    case 'subscriptions':
      if (event.action === 'created') {
        console.log(`Subscription ${links.subscription} created`);
      } else if (event.action === 'cancelled') {
        console.log(`Subscription ${links.subscription} cancelled`);
      } else {
        console.log(`Unhandled subscriptions action: ${event.action}`);
      }
      break;

    default:
      console.log(`Unhandled resource_type: ${event.resource_type}`);
  }
}
