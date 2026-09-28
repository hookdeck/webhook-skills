// Generated with: snipcart-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { verifyAndParse, type SnipcartEvent } from './verify';

// Snipcart webhooks must never be cached or statically optimised.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Asynchronous Snipcart events: order.* and v3/subscription.*
 *
 * Snipcart does NOT sign payloads — authenticity comes from validating the
 * `X-Snipcart-RequestToken` against Snipcart's API. See ./verify.ts.
 */
export async function POST(request: Request): Promise<Response> {
  const { errorResponse, event } = await verifyAndParse(request);
  if (errorResponse) return errorResponse;

  const envelope = event as SnipcartEvent;

  // There is NO event id and NO delivery id in the envelope. For idempotency,
  // key on the order token + eventName (+ createdOn).
  const idempotencyKey = [
    envelope.eventName,
    envelope.content?.token ??
      envelope.content?.orderToken ??
      envelope.content?.subscription?.id ??
      'unknown',
    envelope.createdOn,
  ].join(':');
  console.log(`Snipcart ${envelope.mode} event ${envelope.eventName} (${idempotencyKey})`);

  // Snipcart may add new payload fields at any time without notice. Ignore
  // unknown fields — never apply strict schema validation.
  switch (envelope.eventName) {
    case 'order.completed':
      handleOrderCompleted(envelope.content);
      break;
    case 'order.status.changed':
      // `from` / `to` are TOP-LEVEL, alongside content, not inside it.
      console.log(`Order ${envelope.content.token} status ${envelope.from} -> ${envelope.to}`);
      break;
    case 'order.paymentStatus.changed':
      console.log(`Order ${envelope.content.token} payment ${envelope.from} -> ${envelope.to}`);
      break;
    case 'order.trackingNumber.changed':
      console.log(
        `Order ${envelope.content.token} tracking ${envelope.trackingNumber} (${envelope.trackingUrl})`
      );
      break;
    case 'order.refund.created':
      console.log(
        `Refund of ${envelope.content.amount} ${envelope.content.currency} on ${envelope.content.orderToken}`
      );
      break;
    case 'order.notification.created':
      console.log(
        `Notification ${envelope.content.notificationType} on ${envelope.content.orderToken}`
      );
      break;
    case 'order.withdrawal.created':
      console.log(`Withdrawal ${envelope.content.id} on order ${envelope.content.orderToken}`);
      break;

    // The `v3/` prefix is PART OF THE EVENT NAME. Do not strip it.
    // These payment events do NOT fire for the first payment, only recurring ones.
    case 'v3/subscription.invoice.payment.succeeded':
      console.log(
        `Subscription ${envelope.content.subscription.id} paid, next ${envelope.content.subscription.nextBillingDate}`
      );
      break;
    case 'v3/subscription.invoice.payment.failed':
      console.log(`Subscription ${envelope.content.subscription.id} payment failed`);
      break;
    case 'v3/subscription.state.cancellationRequested':
      console.log(`Subscription ${envelope.content.subscription.id} cancellation requested`);
      break;
    case 'v3/subscription.state.cancelled':
      console.log(`Subscription ${envelope.content.subscription.id} cancelled`);
      break;

    default:
      // New event types can appear. Acknowledge instead of erroring.
      console.log(`Unhandled Snipcart event: ${envelope.eventName}`);
  }

  // Snipcart requires Content-Type application/json AND status 200.
  return Response.json({ received: true }, { status: 200 });
}

function handleOrderCompleted(order: Record<string, any>): void {
  console.log(
    `Order ${order.invoiceNumber} (${order.token}) for ${order.email}: ` +
      `${order.finalGrandTotal ?? order.grandTotal} ${order.currency}, ` +
      `${order.items?.length ?? 0} item(s), status ${order.status}/${order.paymentStatus}`
  );
}
