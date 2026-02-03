# Setting Up SendGrid Webhooks

## Prerequisites

- SendGrid account (free tier works)
- Your application's webhook endpoint URL
- Admin or webhook management permissions

## Get Your Verification Key

1. Log in to [SendGrid Dashboard](https://app.sendgrid.com)
2. Navigate to **Settings** → **Mail Settings**
3. Find **Event Webhook** section
4. Click to expand Event Webhook settings

### Enable Signed Event Webhook

1. Toggle **Signed Event Webhook** to ON
2. Click **Save** to generate your verification key
3. Copy the **Verification Key** that appears
   - Format: `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...`
   - This is your public key for ECDSA verification
4. Save this key as `SENDGRID_WEBHOOK_VERIFICATION_KEY` in your environment

## Register Your Endpoint

1. In the same Event Webhook settings page
2. Enter your **HTTP Post URL**:
   - Production: `https://yourdomain.com/webhooks/sendgrid`
   - Development: Use Hookdeck CLI URL
3. Under **Actions to be posted**, select events to receive:
   - **Engagement**: Open, Click, Spam Report, Unsubscribe
   - **Delivery**: Processed, Deferred, Delivered, Bounce, Dropped

## Recommended Event Selection

For most applications, enable these core events:

- ✅ **Delivered** - Confirm successful delivery
- ✅ **Bounce** - Handle invalid emails
- ✅ **Spam Report** - Maintain sender reputation
- ✅ **Unsubscribe** - Honor opt-outs
- ✅ **Open** - Track engagement (if needed)
- ✅ **Click** - Track link clicks (if needed)

## Test Your Webhook

1. In Event Webhook settings, click **Test Your Integration**
2. SendGrid will send a test batch of events
3. Verify your endpoint receives and processes them
4. Check that signature verification passes

## Additional Settings

### Event Notification Settings

- **Batch Size**: Number of events per request (1-1000)
- **Batch Frequency**: How often to send batches
- **Failure Notification Email**: Get alerts on webhook failures

### Security Recommendations

1. Always use HTTPS endpoints
2. Verify signatures on every request
3. Implement request timeouts
4. Return 200 status quickly
5. Process events asynchronously

## Development Setup

For local development with Hookdeck CLI:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel to your local server
hookdeck listen 3000 --path /webhooks/sendgrid

# Copy the webhook URL provided
# Use this URL in SendGrid dashboard for testing
```

## Troubleshooting

### Common Issues

1. **"Invalid signature" errors**
   - Ensure you're using the raw request body
   - Check that headers are passed correctly
   - Verify the public key is copied completely

2. **Missing events**
   - Check selected events in dashboard
   - Ensure endpoint returns 200 status
   - Look for failure notification emails

3. **Duplicate events**
   - Implement idempotency using `sg_event_id`
   - SendGrid may retry on network failures