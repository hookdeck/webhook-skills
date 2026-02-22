import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Disable body parsing to get raw body for signature verification
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Verify Webflow webhook signature
 */
function verifyWebflowSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  // Validate timestamp to prevent replay attacks (5-minute window)
  const currentTime = Date.now();
  const webhookTime = parseInt(timestamp);

  if (isNaN(webhookTime)) {
    return false;
  }

  const timeDiff = Math.abs(currentTime - webhookTime);
  if (timeDiff > 300000) { // 5 minutes = 300000 milliseconds
    return false;
  }

  // Create signed content: timestamp:body
  const signedContent = `${timestamp}:${rawBody}`;

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // Different lengths = invalid
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get headers
    const signature = request.headers.get('x-webflow-signature');
    const timestamp = request.headers.get('x-webflow-timestamp');

    // Check required headers
    if (!signature || !timestamp) {
      console.error('Missing required headers');
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // Get webhook secret
    const secret = process.env.WEBFLOW_WEBHOOK_SECRET;
    if (!secret) {
      console.error('WEBFLOW_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    // Get raw body
    const rawBody = await request.text();

    // Verify signature
    const isValid = verifyWebflowSignature(rawBody, signature, timestamp, secret);

    if (!isValid) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Parse the verified payload
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (error) {
      console.error('Failed to parse webhook body:', error);
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // Log the event
    console.log('Received Webflow webhook:', {
      type: event.triggerType,
      timestamp: new Date(parseInt(timestamp)).toISOString()
    });

    // Handle different event types
    switch (event.triggerType) {
      case 'form_submission':
        console.log('Form submission:', {
          formName: event.payload.name,
          submittedAt: event.payload.submittedAt,
          data: event.payload.data
        });
        // Add your form submission handling logic here
        break;

      case 'ecomm_new_order':
        console.log('New order:', {
          orderId: event.payload.orderId,
          total: event.payload.total,
          currency: event.payload.currency
        });
        // Add your order processing logic here
        break;

      case 'collection_item_created':
        console.log('New CMS item:', {
          id: event.payload._id,
          name: event.payload.name,
          collection: event.payload._cid
        });
        // Add your CMS sync logic here
        break;

      case 'collection_item_changed':
        console.log('CMS item updated:', {
          id: event.payload._id,
          name: event.payload.name
        });
        break;

      case 'collection_item_deleted':
        console.log('CMS item deleted:', {
          id: event.payload._id
        });
        break;

      case 'site_publish':
        console.log('Site published');
        // Add cache clearing or build trigger logic here
        break;

      case 'user_account_added':
        console.log('New user account:', {
          userId: event.payload.userId
        });
        break;

      default:
        console.log('Unhandled event type:', event.triggerType);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error) {
    console.error('Unexpected error processing webhook:', error);
    // Return 200 to prevent retries if we've already started processing
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

// Export for testing
export { verifyWebflowSignature };