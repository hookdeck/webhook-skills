# Setting Up Clerk Webhooks

## Prerequisites

- Clerk account with an application
- Your application's webhook endpoint URL
- Admin access to your Clerk Dashboard

## Get Your Signing Secret

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Select your application
3. Navigate to **Webhooks** in the left sidebar
4. Click **Add Endpoint**
5. After creating the endpoint, click on it to view details
6. Copy the **Signing Secret** (starts with `whsec_`)

> **Important**: Keep your signing secret secure. Never commit it to source control.

## Register Your Endpoint

1. In the Clerk Dashboard, go to **Webhooks**
2. Click **Add Endpoint**
3. Enter your endpoint URL:
   - Production: `https://yourdomain.com/webhooks/clerk`
   - Local testing: Use Hookdeck CLI URL (see below)
4. Select events to receive:
   - **User events**: `user.created`, `user.updated`, `user.deleted`
   - **Session events**: `session.created`, `session.ended`, `session.removed`
   - **Organization events** (if using orgs): `organization.created`, `organization.updated`
5. Click **Create**

## Local Testing with Hookdeck CLI

For local development, use Hookdeck CLI to create a public URL:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel to your local server
hookdeck listen 3000 --path /webhooks/clerk

# You'll get a URL like: https://hdk.sh/abc123
# Use this URL when registering your endpoint in Clerk
```

## Test Your Webhook

After setting up your endpoint:

1. Go to your endpoint details in Clerk Dashboard
2. Click **Send test event**
3. Select an event type (e.g., `user.created`)
4. Click **Send**
5. Check your application logs to confirm receipt

## Environment Configuration

Add to your `.env` file:

```bash
# From Clerk Dashboard > Webhooks > Your Endpoint
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Production Considerations

### Security

- **Always verify signatures** - Never process webhooks without verification
- **Use HTTPS** - Webhooks should only be sent to secure endpoints
- **Validate timestamps** - Reject old webhooks to prevent replay attacks
- **IP allowlisting** - Optionally restrict to [Svix's IP addresses](https://docs.svix.com/webhook-ips.json)

### Reliability

- **Handle retries** - Clerk retries failed webhooks; ensure idempotency
- **Return quickly** - Process webhooks asynchronously if they take > 5 seconds
- **Monitor failures** - Set up alerts for repeated webhook failures

### Testing

- Use Clerk's test events feature during development
- Set up separate webhook endpoints for staging/production
- Log all received webhooks for debugging

## Troubleshooting

### Common Issues

1. **"Invalid signature" errors**
   - Ensure you're using the raw request body
   - Check that the signing secret matches exactly
   - Verify header names are lowercase in your framework

2. **Missing events**
   - Confirm events are selected in endpoint configuration
   - Check Clerk Dashboard > Webhooks > Logs for delivery attempts

3. **Timeout errors**
   - Keep webhook processing under 5 seconds
   - Move heavy operations to background jobs

## Next Steps

- See [verification.md](verification.md) for signature verification details
- Review [Clerk's webhook best practices](https://clerk.com/docs/integrations/webhooks/sync-data)