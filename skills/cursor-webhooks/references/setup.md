# Setting Up Cursor Webhooks

## Prerequisites

- Cursor Cloud Agent access
- Your application's webhook endpoint URL
- Admin access to configure webhooks in your Cursor settings

## Get Your Signing Secret

1. Log in to your Cursor dashboard
2. Navigate to Cloud Agent settings
3. Go to the Webhooks section
4. Copy your webhook signing secret
   - Keep this secret secure
   - Never commit it to version control
   - Rotate it periodically for security

## Register Your Endpoint

1. In the Cursor Cloud Agent settings, click "Add Webhook"
2. Enter your webhook endpoint URL:
   - Production: `https://yourdomain.com/webhooks/cursor`
   - Development: Use Hookdeck CLI tunnel URL
3. Select the events to receive:
   - `statusChange` - Notifies when agent status changes
4. Save the webhook configuration

## Test Your Webhook

1. Cursor will send a test `statusChange` event to verify your endpoint
2. Your endpoint should:
   - Return a 200 status code
   - Verify the signature
   - Process the test payload

## Environment Configuration

Add your signing secret to your environment:

```bash
# .env file
CURSOR_WEBHOOK_SECRET=your_webhook_secret_here
```

## Security Best Practices

- Always verify webhook signatures
- Use HTTPS endpoints only
- Store secrets in environment variables
- Implement request timeouts
- Log webhook events for debugging
- Return 200 quickly, process asynchronously if needed