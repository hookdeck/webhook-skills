import { NextRequest } from 'next/server';

/**
 * Verify Chargebee webhook Basic Auth
 */
function verifyChargebeeAuth(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');

  // Check if Authorization header exists
  if (!auth || !auth.startsWith('Basic ')) {
    return false;
  }

  // Decode Base64
  const encoded = auth.substring(6);
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

  // Split username:password (handle colons in password)
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    return false;
  }

  const username = decoded.substring(0, colonIndex);
  const password = decoded.substring(colonIndex + 1);

  // Verify credentials against environment variables
  const expectedUsername = process.env.CHARGEBEE_WEBHOOK_USERNAME;
  const expectedPassword = process.env.CHARGEBEE_WEBHOOK_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    console.error('Missing CHARGEBEE_WEBHOOK_USERNAME or CHARGEBEE_WEBHOOK_PASSWORD environment variables');
    return false;
  }

  return username === expectedUsername && password === expectedPassword;
}

export async function POST(request: NextRequest) {
  // Verify Basic Auth
  if (!verifyChargebeeAuth(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const event = await request.json();

    // Log event details
    console.log(`Received Chargebee webhook:`, {
      id: event.id,
      event_type: event.event_type,
      occurred_at: event.occurred_at
    });

    // Handle specific event types
    switch (event.event_type) {
      case 'subscription_created':
        console.log('New subscription created:', event.content?.subscription?.id);
        // TODO: Provision user access, send welcome email, etc.
        break;

      case 'subscription_updated':
        console.log('Subscription updated:', event.content?.subscription?.id);
        // TODO: Update user permissions, sync subscription data
        break;

      case 'subscription_cancelled':
        console.log('Subscription cancelled:', event.content?.subscription?.id);
        // TODO: Schedule access revocation, trigger retention flow
        break;

      case 'subscription_reactivated':
        console.log('Subscription reactivated:', event.content?.subscription?.id);
        // TODO: Restore user access
        break;

      case 'payment_initiated':
        console.log('Payment initiated:', event.content?.transaction?.id);
        // TODO: Track payment process, update status
        break;

      case 'payment_collection_failed':
        console.log('Payment collection failed:', event.content?.transaction?.id);
        // TODO: Send payment failure notification, retry logic
        break;

      case 'invoice_generated':
        console.log('Invoice generated:', event.content?.invoice?.id);
        // TODO: Send invoice to customer
        break;

      case 'customer_created':
        console.log('Customer created:', event.content?.customer?.id);
        // TODO: Create user account, sync customer data
        break;

      default:
        console.log('Unhandled event type:', event.event_type);
    }

    // Always return 200 to acknowledge receipt
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response('Bad Request', { status: 400 });
  }
}