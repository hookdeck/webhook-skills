// Generated with: bridge-api-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Bridge API webhook signature.
 *
 * Bridge signs the RAW body with HMAC-SHA256 (key = signing secret) and sends
 * the digest in the `BridgeApi-Signature` header as one or more comma-separated,
 * scheme-prefixed values: `v1=<UPPERCASE_HEX>,v1=<UPPERCASE_HEX>`.
 *
 * - Only the `v1` scheme is trusted (ignore others → prevents downgrade attacks).
 * - Multiple `v1` values can appear during a secret rotation (old secret valid
 *   24h). Accept the delivery if ANY `v1` value matches.
 */
export function verifyBridgeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const signatures = signatureHeader
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1='))
    .map((s) => s.slice(3));

  if (signatures.length === 0) {
    return false;
  }

  // hex decoding is case-insensitive, so Bridge's UPPERCASE hex compares cleanly
  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do NOT parse first)
  const body = await request.text();
  const signature = request.headers.get('bridgeapi-signature');

  if (!verifyBridgeWebhook(body, signature, process.env.BRIDGE_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  const event = JSON.parse(body);
  const { type, content } = event;

  console.log(`Received ${type} event`);

  // Dispatch on the event `type` field (there is no event header).
  // Expect webhooks for already-deleted users/items — handle defensively.
  switch (type) {
    case 'TEST_EVENT':
      console.log('Test event received from the Bridge dashboard');
      break;

    case 'item.created':
      console.log(`Item created: ${content?.item_id}`);
      break;

    case 'item.refreshed':
      console.log(`Item refreshed: ${content?.item_id} (status_code ${content?.status_code})`);
      break;

    case 'item.account.created':
      console.log(`Account created under item ${content?.item_id}`);
      break;

    case 'item.account.updated':
      console.log(`Account updated under item ${content?.item_id}`);
      break;

    case 'item.account.deleted':
      console.log(`Account deleted under item ${content?.item_id}`);
      break;

    case 'payment.transaction.created':
      console.log('Payment transaction created');
      break;

    case 'payment.transaction.updated':
      console.log('Payment transaction updated');
      break;

    case 'payment.link.updated':
      console.log('Payment link updated');
      break;

    case 'user.deleted':
      console.log(`User deleted: ${content?.user_uuid}`);
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }

  // Acknowledge quickly with a small body (<10 KB)
  return NextResponse.json({ received: true });
}
