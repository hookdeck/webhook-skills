// Generated with: middesk-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Middesk webhook signature.
 *
 * Middesk sends the bare lowercase hex HMAC-SHA256 of the raw request body in the
 * X-Middesk-Signature-256 header. The key is the secret you set when creating the
 * webhook, used whole as a UTF-8 string (no whsec_ stripping, no base64 decoding).
 * This is NOT Standard Webhooks.
 */
function verifyMiddeskWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; timingSafeEqual throws on length mismatch.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification - do NOT parse it first.
  const body = await request.text();
  const signature = request.headers.get('x-middesk-signature-256');

  // Verify the signature before trusting the payload.
  if (!verifyMiddeskWebhook(body, signature, process.env.MIDDESK_WEBHOOK_SECRET)) {
    console.error('Middesk webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification.
  let event: { id?: string; type?: string; data?: { object?: Record<string, any> } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const object = event.data?.object;
  console.log(`Received Middesk event ${event.id}: ${event.type}`);

  switch (event.type) {
    case 'business.created':
      console.log(`Business ${object?.id} created (status: ${object?.status})`);
      // TODO: Store the business ID against your customer record.
      break;

    case 'business.updated':
      console.log(`Business ${object?.id} updated (status: ${object?.status})`);
      // TODO: React to status changes such as approved, rejected or in_review.
      break;

    case 'order.created':
      console.log(`Order ${object?.id} created`);
      break;

    case 'order.updated':
      console.log(`Order ${object?.id} updated (status: ${object?.status})`);
      // TODO: Fetch the completed order results.
      break;

    case 'monitor.created':
    case 'monitor.updated':
      console.log(`Monitor event ${event.type} for ${object?.id}`);
      break;

    case 'tin.retried':
      console.log('TIN retry completed');
      break;

    case 'lien.updated':
      console.log(`Lien ${object?.id} updated`);
      break;

    default:
      // Return 2xx for unhandled types so Middesk does not retry.
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Any 2xx tells Middesk the delivery succeeded.
  return NextResponse.json({ received: true });
}
