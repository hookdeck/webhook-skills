// Generated with: infinite-giving-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyInfiniteGivingWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw bytes: the signature covers the body exactly as received.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const result = verifyInfiniteGivingWebhook(
    rawBody,
    request.headers.get('x-ig-timestamp'),
    request.headers.get('x-ig-signature'),
    process.env.INFINITE_GIVING_WEBHOOK_SECRET,
    Number(process.env.INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS) || 0
  );

  if (!result.valid) {
    console.error(`Infinite Giving webhook verification failed: ${result.error}`);
    return new NextResponse(result.error, { status: 401 });
  }

  // Parse only after the signature check.
  let payload: { id?: string; event?: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return new NextResponse('Invalid payload', { status: 400 });
  }

  // Dispatch on the body's `event` field. X-IG-Webhook-Id (same as payload.id)
  // is unique per delivery: use it to dedupe retries.
  const deliveryId = request.headers.get('x-ig-webhook-id') || payload.id;
  const { event } = payload;
  const data = payload.data ?? {};

  switch (event) {
    case 'donation:created':
      console.log(
        `New ${data.type} donation ${data.id} (${data.identifier}, qty ${data.quantity}) ` +
          `for ${data.organization?.name}: status ${data.status} [${deliveryId}]`
      );
      break;

    case 'donation:updated':
      // There is no donation:completed event: completion is status "complete" here.
      if (data.status === 'complete') {
        console.log(`Donation ${data.id} complete, tax deductible: ${data.tax_deductible_amount} [${deliveryId}]`);
      } else if (data.status === 'canceled' || data.status === 'failed') {
        console.log(`Donation ${data.id} ${data.status}: ${data.cancelation_reason ?? 'no reason given'} [${deliveryId}]`);
      } else {
        console.log(`Donation ${data.id} updated, status ${data.status} [${deliveryId}]`);
      }
      break;

    default:
      console.log(`Unhandled Infinite Giving event: ${event} [${deliveryId}]`);
  }

  return NextResponse.json({ received: true });
}
