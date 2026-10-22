// Generated with: printify-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Verify the X-Pfy-Signature header.
 * Format: "sha256=<hex HMAC-SHA256 of the raw body>", keyed with the webhook
 * secret as a UTF-8 string (not base64-decoded).
 */
function verifyPrintifySignature(
  rawBody: string,
  header: string,
  secret: string
): { valid: boolean; error?: string } {
  if (!header.startsWith('sha256=')) {
    return { valid: false, error: 'Malformed X-Pfy-Signature header' };
  }
  const received = header.slice('sha256='.length).trim();
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    const ok = crypto.timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
    return ok ? { valid: true } : { valid: false, error: 'Invalid signature' };
  } catch {
    return { valid: false, error: 'Invalid signature' }; // Different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.PRINTIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PRINTIFY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const signatureHeader = request.headers.get('x-pfy-signature');
  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing X-Pfy-Signature header' }, { status: 400 });
  }

  // IMPORTANT: read the raw text body, whatever the Content-Type; don't call request.json() first.
  const rawBody = await request.text();

  const result = verifyPrintifySignature(rawBody, signatureHeader, secret);
  if (!result.valid) {
    console.error('Printify signature verification failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Parse only after verification
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Envelope: { id, type, created_at, resource: { id, type, data } }
  // Dedupe on event.id (see webhook-handler-patterns); Printify retries 4xx/5xx up to 3 times.
  const { id, type, resource } = event;
  const data = resource?.data ?? {};
  console.log(`Received Printify webhook: ${type} (${id})`);

  switch (type) {
    case 'order:created':
      console.log('Order created:', resource?.id);
      // TODO: no data is sent; fetch the order via the API
      break;
    case 'order:updated':
      console.log('Order updated:', resource?.id, data.status);
      // TODO: sync production status
      break;
    case 'order:line-item:canceled':
      console.log('Line item canceled:', resource?.id, data.line_item_id, data.status_details);
      // TODO: notify the customer / restock
      break;
    case 'order:sent-to-production':
      console.log('Order sent to production:', resource?.id);
      // TODO: mark the order as in production
      break;
    case 'order:shipment:created':
      console.log('Shipment created:', resource?.id, data.carrier?.tracking_number);
      // TODO: email tracking details
      break;
    case 'order:shipment:delivered':
      console.log('Shipment delivered:', resource?.id, data.delivered_at);
      // TODO: mark delivered
      break;
    case 'product:created':
    case 'product:updated':
      console.log(`Product ${String(type).split(':')[1]}:`, resource?.id);
      // TODO: sync the product
      break;
    case 'product:publish:started':
      console.log('Product publish started:', resource?.id, data.action);
      // TODO: publish to your storefront, then confirm via the API
      break;
    case 'product:deleted':
      console.log('Product deleted:', resource?.id);
      // TODO: remove the product from your catalog
      break;
    case 'shop:disconnected':
      console.log('Shop disconnected:', resource?.id);
      // TODO: stop syncing this shop
      break;
    case 'personalization-preview-task:processed':
      console.log('Personalization preview processed:', data.task_id, data.status);
      // TODO: fetch mockups on completed, retry on failed
      break;
    default:
      console.log('Unhandled Printify event:', type);
  }

  return NextResponse.json({ received: true, type });
}
