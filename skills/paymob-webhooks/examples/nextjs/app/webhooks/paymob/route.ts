// Generated with: paymob-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

type CallbackType = 'TRANSACTION' | 'TOKEN';

interface PaymobCallback {
  type?: string;
  obj?: Record<string, any>;
}

// The keys Paymob signs, in the documented order, per callback `type`.
// TRANSACTION: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback
// TOKEN: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-for-card-tokens
export const HMAC_FIELDS: Record<CallbackType, string[]> = {
  TRANSACTION: [
    'amount_cents',
    'created_at',
    'currency',
    'error_occured',
    'has_parent_transaction',
    'id',
    'integration_id',
    'is_3d_secure',
    'is_auth',
    'is_capture',
    'is_refunded',
    'is_standalone_payment',
    'is_voided',
    'order.id',
    'owner',
    'pending',
    'source_data.pan',
    'source_data.sub_type',
    'source_data.type',
    'success',
  ],
  TOKEN: [
    'card_subtype',
    'created_at',
    'email',
    'id',
    'masked_pan',
    'merchant_id',
    'order_id',
    'token',
  ],
};

function isCallbackType(type: unknown): type is CallbackType {
  return type === 'TRANSACTION' || type === 'TOKEN';
}

function getPath(obj: Record<string, any>, path: string): unknown {
  return path
    .split('.')
    .reduce<any>((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

/**
 * The string Paymob signs: the values of the keys for the callback's `type`,
 * read from `obj`, joined in order with no separator. String() renders
 * booleans as "true"/"false" and numbers as their digits.
 */
export function buildSignedString(type: string | undefined, obj: Record<string, any>): string | null {
  if (!isCallbackType(type)) return null;
  return HMAC_FIELDS[type]
    .map((field) => {
      const value = getPath(obj, field);
      return value === undefined || value === null ? '' : String(value);
    })
    .join('');
}

/**
 * Verify a Paymob callback: HMAC-SHA512 (hex) over the string above, compared
 * with the `hmac` query parameter (not a header, not the raw body).
 */
export function verifyPaymobHmac(
  body: PaymobCallback,
  hmacParam: string | null,
  secret: string | undefined
): boolean {
  const signed = buildSignedString(body.type, body.obj || {});
  if (signed === null || !hmacParam || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(signed).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(hmacParam.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * A transaction's state, from its booleans. Paymob sends no event name for the
 * outcome: success false with pending false is a decline.
 */
export function transactionState(obj: Record<string, any>): string {
  if (obj.is_refunded) return 'refunded';
  if (obj.is_voided) return 'voided';
  if (obj.pending) return 'pending';
  if (obj.success && obj.is_auth && !obj.is_capture) return 'authorized';
  if (obj.is_capture) return 'captured';
  if (obj.success) return 'succeeded';
  return 'declined';
}

export async function POST(request: NextRequest) {
  const hmacParam = new URL(request.url).searchParams.get('hmac');

  // Parse the JSON: verification needs the individual fields.
  let body: PaymobCallback;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || !body.obj || !isCallbackType(body.type)) {
    return NextResponse.json({ error: 'Unexpected callback payload' }, { status: 400 });
  }

  if (!verifyPaymobHmac(body, hmacParam, process.env.PAYMOB_HMAC_SECRET)) {
    console.error('Paymob HMAC verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const obj = body.obj;

  if (body.type === 'TOKEN') {
    // A customer saved a card. Your code: store obj.token against obj.order_id.
    console.log(`Card token ${obj.id} for order ${obj.order_id}`);
    return NextResponse.json({ received: true });
  }

  const state = transactionState(obj);
  console.log(`Transaction ${obj.id} (order ${obj.order?.id}): ${state}`);

  switch (state) {
    case 'succeeded':
      // Your code: mark the order paid, fulfil, send a receipt
      break;
    case 'declined':
      // Your code: tell the customer, release the reservation
      break;
    case 'pending':
      // Your code: wait for a later callback (OTP page, kiosk or cash payment)
      break;
    case 'authorized':
      // Your code: funds held; capture when ready
      break;
    case 'captured':
      // Your code: complete a prior authorization
      break;
    case 'refunded':
      // Your code: reverse fulfilment, credit the customer
      break;
    case 'voided':
      // Your code: cancel an uncaptured authorization
      break;
    default:
      console.log(`Unhandled state for transaction ${obj.id}`);
  }

  // Acknowledge quickly; do slow work in the background.
  return NextResponse.json({ received: true });
}
