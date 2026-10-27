// Generated with: proof-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Proof webhook signature.
 *
 * Proof sends the bare lowercase hex HMAC-SHA256 of the raw request body in the
 * `X-Notarize-Signature` header. The key is the API key that created the
 * subscription, or its `signing_key`. No timestamp is signed.
 */
function verifyProofSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  // Exactly 64 hex characters before any decoding (Buffer.from(x, 'hex') drops bad chars)
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex'); // 32 bytes, validated
  return crypto.timingSafeEqual(expected, received);
}

export async function POST(request: NextRequest) {
  // Read the raw bytes for signature verification: do not parse the JSON first
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-notarize-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-Notarize-Signature header' },
      { status: 401 }
    );
  }

  if (!verifyProofSignature(rawBody, signature, process.env.PROOF_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Signature is valid: now it is safe to parse the body
  let payload: { event?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const data = payload.data ?? {};

  switch (payload.event) {
    case 'transaction.created':
      console.log('Transaction created:', data.transaction_id);
      // TODO: Record the transaction in your system
      break;

    case 'transaction.completed':
      console.log('Transaction completed:', data.transaction_id);
      // TODO: Update state. Documents may not be downloadable yet: wait for transaction.released
      break;

    case 'transaction.released':
      console.log('Transaction released:', data.transaction_id);
      // TODO: Fetch the signed documents from the Proof API
      break;

    case 'transaction.declined':
      console.log('Transaction declined:', data.transaction_id);
      // TODO: Notify the requester
      break;

    case 'notary.created':
      console.log('Notary created:', data.notary_id);
      // TODO: Sync the notary to your system
      break;

    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  // Only a 200 acknowledges; anything else is retried (up to 16 attempts over 48 hours).
  // Deliveries can repeat and arrive out of order, so keep handlers idempotent.
  return NextResponse.json({ received: true }, { status: 200 });
}
