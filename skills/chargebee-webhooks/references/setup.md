# Setting Up Chargebee Webhooks

## Prerequisites

- Chargebee account with admin access
- Your application's webhook endpoint URL
- HTTPS endpoint (required for production)

## Configure Webhook Endpoint

1. Log in to your Chargebee dashboard
2. Navigate to **Settings** → **Webhooks**
   - Note: The exact path may vary. Look for "Webhooks" under Settings, Configure Chargebee, or Developer Settings
3. Click **Add Webhook** or **New Webhook** button

## Webhook Configuration

### Basic Settings

1. **Webhook Name**: Give your webhook a descriptive name (e.g., "Production App Webhook")
2. **Webhook URL**: Enter your endpoint URL (e.g., `https://app.example.com/webhooks/chargebee`)

### Enable Basic Authentication (Recommended)

1. Toggle **"Protect webhook URL with basic authentication"** to ON
2. Set **Username**: Choose a username for Basic Auth
3. Set **Password**: Choose a strong password for Basic Auth
4. Save these credentials - you'll need them in your application:
   ```bash
   CHARGEBEE_WEBHOOK_USERNAME=your_chosen_username
   CHARGEBEE_WEBHOOK_PASSWORD=your_chosen_password
   ```

### Alternative: Custom Key in URL

If you can't use Basic Auth, include a secret key in your webhook URL:
```
https://app.example.com/webhooks/chargebee?key=your_secret_key_here
```

### Select Events

1. Choose which events to receive:
   - **All Events**: Receive notifications for all event types
   - **Selected Events**: Choose specific events (recommended)

2. Common events to select:
   - Subscription Events: `subscription_created`, `subscription_changed`, `subscription_cancelled`
   - Payment Events: `payment_succeeded`, `payment_failed`
   - Invoice Events: `invoice_generated`, `invoice_updated`
   - Customer Events: `customer_created`, `customer_updated`

3. Click **Create Webhook** to save

## Test Your Webhook

### Using Chargebee Test Events

1. After creating your webhook, click on it in the webhooks list
2. Click **Test Webhook** button
3. Select an event type to send
4. Click **Send Test Event**
5. Check your application logs to verify receipt

### Manual Testing

You can also trigger real events in test mode:
1. Ensure you're in Chargebee test mode
2. Create a test subscription or process a test payment
3. Monitor your webhook endpoint for incoming events

## Production Considerations

### Security
- Always use HTTPS endpoints
- Implement Basic Auth verification
- Store credentials securely (environment variables)
- Never log full webhook payloads in production

### Reliability
- Respond quickly (within 20 seconds)
- Process events asynchronously if needed
- Implement idempotency to handle duplicate events
- Return 2XX status codes for successful processing

### Monitoring
- Set up alerts for webhook failures
- Monitor webhook processing time
- Track event types and volumes
- Review failed webhooks in Chargebee dashboard

## Multiple Environments

Create separate webhooks for each environment:
- Development: Local tunnel URL (via Hookdeck CLI)
- Staging: Staging server URL with test credentials
- Production: Production URL with production credentials

Chargebee allows up to 5 webhook endpoints, making it easy to manage multiple environments.