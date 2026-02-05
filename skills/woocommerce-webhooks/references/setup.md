# Setting Up WooCommerce Webhooks

## Prerequisites

- WordPress site with WooCommerce plugin installed
- Admin access to WooCommerce settings
- Your webhook endpoint URL (where you want to receive webhooks)
- HTTPS endpoint recommended for production (required for sensitive events)

## Get Your Webhook Secret

The webhook secret is used to generate signatures for verifying webhook authenticity. WooCommerce generates this automatically when you create a webhook, but you can also set a custom one.

1. Go to **WooCommerce > Settings > Advanced > Webhooks**
2. Click **Add webhook**
3. The **Secret** field will auto-populate with a secure random string
4. **Copy and save this secret** - you'll need it for signature verification
5. Alternatively, you can enter your own custom secret

## Register Your Webhook Endpoint

1. In the **Webhook data** form, fill in:
   - **Name**: Descriptive name (e.g., "Order Processing Webhook")
   - **Status**: Set to **Active**
   - **Topic**: Select the event to listen for (see options below)
   - **Delivery URL**: Your endpoint URL (e.g., `https://yourapp.com/webhooks/woocommerce`)
   - **Secret**: Use the auto-generated secret or enter your own

2. **Topic Options**:
   - **Order created** - `order.created`
   - **Order updated** - `order.updated`
   - **Order deleted** - `order.deleted`
   - **Order restored** - `order.restored`
   - **Product created** - `product.created`
   - **Product updated** - `product.updated`
   - **Product deleted** - `product.deleted`
   - **Product restored** - `product.restored`
   - **Customer created** - `customer.created`
   - **Customer updated** - `customer.updated`
   - **Customer deleted** - `customer.deleted`
   - **Coupon created** - `coupon.created`
   - **Coupon updated** - `coupon.updated`
   - **Coupon deleted** - `coupon.deleted`
   - **Action** - Custom action hooks (advanced users)

3. Click **Save Webhook**

## Multiple Webhooks

You can create multiple webhooks for different events or endpoints:

- One webhook for order events → order processing system
- Another webhook for customer events → CRM system
- Third webhook for product events → inventory management

Each webhook can have its own delivery URL and secret.

## Test Your Webhook

After saving, WooCommerce automatically sends a test ping to your endpoint. Check your webhook logs to confirm it was received.

You can also trigger test events:
- Create a test order (for order webhooks)
- Add a test product (for product webhooks)
- Register a test customer (for customer webhooks)

## Webhook Management

### View Webhook Status

In **WooCommerce > Settings > Advanced > Webhooks**, you can see:
- **Status**: Active, Paused, or Disabled
- **Pending deliveries**: Number of failed deliveries waiting for retry
- **Last delivery**: Timestamp of most recent delivery attempt

### Automatic Disabling

WooCommerce automatically disables webhooks after 5 consecutive delivery failures. A failure is any response that's not:
- 2xx (success)
- 301 (moved permanently)
- 302 (found/temporary redirect)

### View Webhook Logs

Check delivery logs at **WooCommerce > Status > Logs**:
1. Select **webhook-delivery** from the "All sources" dropdown
2. Choose a log file to view delivery details and responses
3. Use this for debugging connection issues or response errors

## Security Considerations

1. **Use HTTPS**: Always use HTTPS endpoints in production
2. **Verify Signatures**: Always validate the `X-WC-Webhook-Signature` header
3. **Keep Secrets Secure**: Store webhook secrets in environment variables
4. **IP Allowlisting**: Consider restricting access to your store's IP range
5. **Rate Limiting**: Implement rate limiting on your webhook endpoints

## Custom Topics (Advanced)

For advanced users, you can create custom webhook topics using the `woocommerce_webhook_topic_hooks` filter:

```php
// In your theme's functions.php or plugin
add_filter('woocommerce_webhook_topic_hooks', function($topic_hooks) {
    $topic_hooks['cart.updated'] = ['woocommerce_add_to_cart'];
    return $topic_hooks;
});
```

This creates a custom "cart.updated" topic that triggers when items are added to cart.