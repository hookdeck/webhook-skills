import crypto from 'crypto';
import { NextRequest } from 'next/server';

/**
 * Verify WooCommerce webhook signature using HMAC SHA-256
 * @param rawBody - Raw request body as string
 * @param signature - X-WC-Webhook-Signature header value
 * @param secret - Webhook secret from WooCommerce
 * @returns True if signature is valid
 */
function verifyWooCommerceWebhook(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret || !rawBody) {
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // Different lengths will cause an error
    return false;
  }
}

/**
 * Handle different WooCommerce event types
 * @param topic - Event topic (e.g., "order.created")
 * @param payload - Webhook payload
 */
function handleWooCommerceEvent(topic: string, payload: any) {
  console.log(`Processing ${topic} event for ID: ${payload.id}`);
  
  switch (topic) {
    case 'order.created':
      console.log(`New order #${payload.id} for $${payload.total}`);
      // Add your order processing logic here
      break;
      
    case 'order.updated':
      console.log(`Order #${payload.id} updated to status: ${payload.status}`);
      // Add your order update logic here
      break;
      
    case 'product.created':
      console.log(`New product: ${payload.name} (ID: ${payload.id})`);
      // Add your product sync logic here
      break;
      
    case 'product.updated':
      console.log(`Product updated: ${payload.name} (ID: ${payload.id})`);
      // Add your product update logic here
      break;
      
    case 'customer.created':
      console.log(`New customer: ${payload.email} (ID: ${payload.id})`);
      // Add your customer onboarding logic here
      break;
      
    case 'customer.updated':
      console.log(`Customer updated: ${payload.email} (ID: ${payload.id})`);
      // Add your customer update logic here
      break;
      
    default:
      console.log(`Unhandled event type: ${topic}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-wc-webhook-signature');
    const topic = request.headers.get('x-wc-webhook-topic');
    const source = request.headers.get('x-wc-webhook-source');
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    
    console.log(`Received webhook: ${topic} from ${source}`);
    
    // Get raw body for signature verification
    const rawBody = await request.text();
    
    // Verify webhook signature
    if (!verifyWooCommerceWebhook(rawBody, signature, secret)) {
      console.log('❌ Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    console.log('✅ Signature verified');
    
    // Parse the JSON payload
    const payload = JSON.parse(rawBody);
    
    // Handle the event
    if (topic) {
      handleWooCommerceEvent(topic, payload);
    }
    
    // Respond with success
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Export the verification function for testing
export { verifyWooCommerceWebhook };