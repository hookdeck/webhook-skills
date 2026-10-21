import { NextRequest, NextResponse } from 'next/server';
import { verifyRutterWebhook } from '../../../lib/rutter';

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signatures =
    request.headers.get('x-rutter-signatures') || request.headers.get('x-rutter-signature');

  // Verify webhook signature (two secrets are active during a rotation)
  const secrets = [process.env.RUTTER_CLIENT_SECRET, process.env.RUTTER_CLIENT_SECRET_PREVIOUS];
  if (!signatures || !verifyRutterWebhook(body, signatures, secrets)) {
    console.error('Rutter webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Received ${event.type} ${event.code} for connection ${event.connection_id}`);

  // Handle the event based on code
  switch (event.code) {
    case 'INITIAL_UPDATE':
      console.log('Initial data download complete:', event.connection_id);
      // TODO: Start fetching merchant data for this connection
      break;

    case 'CONNECTION_NEEDS_UPDATE':
      console.log('Connection needs re-authentication:', event.update_url);
      // TODO: Send event.update_url to the merchant
      break;

    case 'CONNECTION_DISABLED':
      console.log('Connection disabled:', event.disable_error);
      // TODO: Alert the merchant, check connection status
      break;

    case 'ORDER_CREATED':
      console.log('New order:', event.order?.id);
      // TODO: Sync new order, trigger fulfillment, etc.
      break;

    case 'ORDER_UPDATED':
      console.log('Order updated:', event.order?.id);
      // TODO: Update stored order
      break;

    case 'ORDER_DELETED':
      console.log('Order deleted:', event.order?.id);
      // TODO: Remove stored order
      break;

    case 'INVOICE_CREATED':
      console.log('New invoice:', event.invoice?.id);
      // TODO: Reconcile invoice
      break;

    case 'INVOICE_UPDATED':
      console.log('Invoice updated:', event.invoice?.id);
      // TODO: Update ledger sync
      break;

    default:
      console.log(`Unhandled event: ${event.type} ${event.code}`);
  }

  // Return 2xx within 5 seconds to acknowledge receipt
  return NextResponse.json({ received: true });
}
