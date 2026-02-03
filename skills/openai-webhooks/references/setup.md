# Setting Up OpenAI Webhooks

## Prerequisites

- OpenAI account with API access
- Organization owner or member with webhook configuration permissions
- Your application's webhook endpoint URL (must be HTTPS in production)

## Get Your Signing Secret

1. Go to [OpenAI Platform](https://platform.openai.com) → Settings → Webhooks
2. Click "Add endpoint" if creating new, or select existing endpoint
3. Your signing secret will be displayed (format: `whsec_...`)
4. Copy and save this secret securely - you'll need it to verify webhook signatures

## Register Your Endpoint

1. In the OpenAI Platform, go to Settings → Webhooks
2. Click "Add endpoint"
3. Configure your endpoint:
   - **URL**: Your webhook endpoint (e.g., `https://api.example.com/webhooks/openai`)
   - **Events**: Select the events you want to receive:
     - Fine-tuning events: `fine_tuning.job.*`
     - Batch events: `batch.*`
     - Realtime events: `realtime.session.*`
   - **Description**: Optional description for your reference
4. Click "Create endpoint"
5. Copy the signing secret that's displayed

## Testing Your Endpoint

OpenAI provides test events to verify your endpoint is working:

1. Go to your webhook endpoint in the dashboard
2. Click "Send test event"
3. Select an event type to test
4. Click "Send test"
5. Verify your endpoint receives and processes the test event

## Development vs Production

### Local Development

For local testing, use a tunneling service like Hookdeck CLI:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel to your local server
hookdeck listen 3000 --path /webhooks/openai
```

This provides:
- Public HTTPS URL for OpenAI to send webhooks
- Request inspection and replay capabilities
- No account required for basic usage

### Production Requirements

- **HTTPS Required**: OpenAI only sends webhooks to HTTPS endpoints
- **Valid SSL Certificate**: Self-signed certificates are not accepted
- **Response Time**: Must respond within 20 seconds
- **IP Allowlist**: Not required - OpenAI doesn't publish static IPs

## Multiple Endpoints

You can configure multiple webhook endpoints for different purposes:

- Separate endpoints for different environments (dev, staging, prod)
- Different endpoints for different event types
- Failover endpoints for redundancy

Each endpoint has its own signing secret.

## Event Filtering

Configure which events to receive at the endpoint level:

- **Fine-tuning**: All events related to fine-tuning jobs
- **Batch**: Events for batch API operations
- **Realtime**: Session lifecycle events
- **All Events**: Receive all current and future event types

## Webhook Security

1. **Always verify signatures** - Never trust incoming webhooks without verification
2. **Use environment variables** - Store signing secret securely
3. **Timestamp validation** - OpenAI uses Standard Webhooks with timestamp validation to prevent replay attacks. Always verify the webhook-timestamp header is within 5 minutes of the current time
4. **Return quickly** - Process events asynchronously if needed
5. **Idempotency** - Handle duplicate events gracefully using event IDs