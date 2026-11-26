import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const webhookSecret = process.env.ASCEND_WEBHOOK_SECRET!;

interface AscendEvent {
  id: string;
  type: string;
  data: Record<string, unknown> & { id?: string };
}

/**
 * Verify an Ascend webhook signature.
 *
 * Ascend sends `X-Ascend-Signature: t=<timestamp>,v1=<hex_hmac_sha256>`.
 * The signed string is `<timestamp>:<rawBody>` (colon separator, RAW body).
 * There is no official Ascend SDK, so we verify manually with `crypto`.
 */
function verifyAscendSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=');
    if (key && value) parts[key.trim()] = value.trim();
  }

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${rawBody}`) // colon separator + RAW body
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // hex length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do not parse first).
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-ascend-signature');

  if (!verifyAscendSignature(rawBody, signatureHeader, webhookSecret)) {
    console.error('Ascend webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: AscendEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Ascend payloads are { id, type, data }. `data` IS the resource object
  // (no Stripe-style `data.object` wrapper).
  switch (event.type) {
    case 'invoice.paid':
      console.log('Invoice paid:', event.data.id);
      // Your code: Record payment, update billing history, unlock coverage.
      break;

    case 'invoice.voided':
      console.log('Invoice voided:', event.data.id);
      // Your code: Reverse the local billing record.
      break;

    case 'payout.paid':
      console.log('Payout paid:', event.data.id);
      // Your code: Reconcile payouts, update accounting ledger.
      break;

    case 'refund.paid':
      console.log('Refund paid:', event.data.id);
      // Your code: Update policy/billing records, notify the customer.
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt.
  return NextResponse.json({ received: true });
}
