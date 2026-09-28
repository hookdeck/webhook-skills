// Generated with: snipcart-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { verifyAndParse } from '../verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * `taxes.calculate` — a SYNCHRONOUS webhook: Snipcart consumes this response
 * BODY during checkout to apply taxes.
 *
 * Configured at Store configurations -> Taxes -> Providers -> Webhooks (its own
 * setting, NOT the general webhook URL), and it must point DIRECTLY at this
 * app — a store-and-forward gateway cannot return this body to the client.
 */
export async function POST(request: Request): Promise<Response> {
  const { errorResponse, event } = await verifyAndParse(request);
  if (errorResponse) return errorResponse;

  // content is the live CART for taxes.calculate (not an order). Dates inside
  // it are Unix timestamps, not ISO strings, and `paymentMethod` is a number.
  const cart = event!.content ?? {};
  const items: Array<Record<string, any>> = cart.items ?? [];
  const taxableBase = items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);

  // Trivial illustrative calculation — replace with your tax engine.
  const rate = 0.05;
  const amount = Math.round(taxableBase * rate * 100) / 100;

  // `name` and `amount` are required. `amount` is in CURRENCY UNITS, not cents.
  return Response.json(
    {
      taxes: [
        {
          name: 'Sales tax',
          amount,
          rate,
          numberForInvoice: 'TAX-001',
        },
      ],
    },
    { status: 200 }
  );
}
