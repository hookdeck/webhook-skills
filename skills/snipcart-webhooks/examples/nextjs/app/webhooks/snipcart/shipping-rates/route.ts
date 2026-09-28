// Generated with: snipcart-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { verifyAndParse } from '../verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * `shippingrates.fetch` — a SYNCHRONOUS webhook: Snipcart consumes this
 * response BODY during checkout to show shipping options.
 *
 * Configured at Store configurations -> Shipping -> Webhooks (its own setting,
 * NOT the general webhook URL), and it must point DIRECTLY at this app: a
 * store-and-forward gateway such as Hookdeck cannot synchronously return a
 * destination's response to the client.
 *
 * It carries the same `X-Snipcart-RequestToken`, so validate it first.
 */
export async function POST(request: Request): Promise<Response> {
  const { errorResponse, event } = await verifyAndParse(request);
  if (errorResponse) return errorResponse;

  // content is the current ORDER for shippingrates.fetch. The documented
  // shippingrates.fetch example uses FLAT address fields
  // (`shippingAddressCountry`, `shippingAddressPostalCode`, ...), unlike the
  // nested `shippingAddress` object on order events — read both.
  const order = event!.content ?? {};
  const country = order.shippingAddressCountry ?? order.shippingAddress?.country;

  if (!country) {
    // Customer-facing error: still a 2XX, with an `errors` array.
    return Response.json(
      {
        errors: [
          { key: 'invalid_shipping_address', message: 'A shipping country is required.' },
        ],
      },
      { status: 200 }
    );
  }

  // Trivial illustrative calculation — replace with your carrier logic.
  const weight = Number(order.totalWeight) || 0;
  const base = country === 'US' ? 10 : 25;
  const cost = Math.round((base + weight * 0.01) * 100) / 100;

  // `cost` and `description` are required. `userDefinedId` must be unique and
  // ends up on the order as `shippingRateUserDefinedId`.
  return Response.json(
    {
      rates: [
        {
          cost,
          description: 'Standard shipping',
          userDefinedId: 'standard',
          guaranteedDaysToDelivery: 5,
        },
        {
          cost: Math.round(cost * 2 * 100) / 100,
          description: 'Express shipping',
          userDefinedId: 'express',
          guaranteedDaysToDelivery: 2,
        },
      ],
    },
    { status: 200 }
  );
}
