// Generated with: flexport-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Flexport webhook signature.
 *
 * Flexport signs the raw request body with HMAC-SHA256 keyed on your endpoint's
 * secret token and sends the digest in `X-Hub-Signature-256` as `sha256=<hex>`.
 */
function verifyFlexportWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do NOT parse first)
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  // Verify webhook signature BEFORE parsing
  if (!verifyFlexportWebhook(body, signature, process.env.FLEXPORT_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the Flexport Event object after verification
  const event = JSON.parse(body);
  const type = event.type as string;     // milestone identifier, e.g. "/shipment#created"
  const data = event.data || {};

  console.log(`Received Flexport event ${type} (id: ${event.id})`);

  // Dispatch on the milestone identifier (/object#event format).
  // All of these are documented types on Flexport's Milestones page.
  switch (type) {
    case '/shipment#created':
      console.log('Shipment created:', data.resource?.id);
      // Your code: create internal shipment/order record
      break;

    case '/shipment#booking_confirmed':
      console.log('Booking confirmed for shipment:', data.shipment?.id);
      // Your code: notify stakeholders, update ETAs
      break;

    case '/shipment#delivered_in_full':
      console.log('Shipment delivered in full:', data.shipment?.id);
      // Your code: close out order, trigger billing
      break;

    case '/shipment_leg#departed':
      console.log('Shipment leg departed:', data.location?.place?.name);
      // Your code: update in-transit status, notify customer
      break;

    case '/shipment_leg#arrived':
      console.log('Shipment leg arrived:', data.location?.place?.name);
      // Your code: trigger customs / last-mile workflow
      break;

    case '/document#document_created':
      console.log('Document created:', data.resource?.id);
      // Your code: sync commercial invoice / BOL / packing list
      break;

    case '/invoice#invoice_payment_made':
      console.log('Invoice payment made:', data.resource?.id);
      // Your code: reconcile accounts payable
      break;

    case '/purchase_order#acknowledged':
      console.log('Purchase order acknowledged:', data.resource?.id);
      // Your code: advance procurement workflow
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }

  // Return 200 promptly: Flexport retries a delivery a number of times
  // when it doesn't get one, so a slow response can bring the Event back.
  return NextResponse.json({ received: true });
}
