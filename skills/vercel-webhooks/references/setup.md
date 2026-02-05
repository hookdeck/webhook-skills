# Setting Up Vercel Webhooks

## Prerequisites

- Vercel account with Pro or Enterprise plan
- Your application's webhook endpoint URL
- Access to team settings in Vercel dashboard

## Get Your Signing Secret

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to your team settings:
   - Click on your team name in the top navigation
   - Select "Settings" from the dropdown
3. Click on "Webhooks" in the left sidebar
4. Click "Create Webhook" button

## Register Your Endpoint

1. **Enter Webhook URL**
   - Provide your public endpoint URL (e.g., `https://api.example.com/webhooks/vercel`)
   - Must be HTTPS for production
   - Cannot require authentication headers

2. **Select Events to Receive**

   Common selections for different use cases:

   **Deployment Monitoring:**
   - `deployment.created`
   - `deployment.succeeded`
   - `deployment.error`
   - `deployment.canceled`

   **Project Management:**
   - `project.created`
   - `project.removed`
   - `project.renamed`

   **Security Monitoring:**
   - `attack.detected`

3. **Choose Project Scope**
   - **All Projects**: Receive events for all projects in your team
   - **Specific Projects**: Select individual projects to monitor

4. **Save Your Webhook Secret**
   - After creating the webhook, Vercel displays a secret
   - **IMPORTANT**: This secret is shown only once!
   - Copy it immediately and store securely
   - Format: Random string (not prefixed like some providers)

## Test Your Webhook

Vercel doesn't provide a built-in test button, but you can:

1. **Trigger a Real Event**
   - Create a test deployment: `vercel --force`
   - This sends a `deployment.created` event

2. **Use Hookdeck CLI for Testing**
   ```bash
   # Install Hookdeck CLI
   npm install -g hookdeck-cli

   # Create a local tunnel
   hookdeck listen 3000 --path /webhooks/vercel

   # Update your Vercel webhook URL to the Hookdeck URL
   # Now you can inspect all webhook deliveries locally
   ```

## Managing Webhooks

### View Webhook Details
1. Go to Settings → Webhooks
2. Click on a webhook to see:
   - Endpoint URL
   - Selected events
   - Recent deliveries (last 24 hours)
   - Delivery status and response codes

### Update Webhook Configuration
1. Click on the webhook you want to modify
2. You can change:
   - Events selection
   - Project scope
   - Endpoint URL
3. Note: You cannot view or regenerate the secret

### Delete a Webhook
1. Click on the webhook
2. Click "Delete Webhook"
3. Confirm deletion

## Multiple Environments

For different environments, create separate webhooks:

```
Production: https://api.example.com/webhooks/vercel
Staging: https://staging-api.example.com/webhooks/vercel
Development: https://your-tunnel.hookdeck.com/webhooks/vercel
```

Each webhook has its own secret - store them separately:
```bash
# Production
VERCEL_WEBHOOK_SECRET_PROD=secret_prod_xxx

# Staging
VERCEL_WEBHOOK_SECRET_STAGING=secret_staging_xxx

# Development (local tunnel)
VERCEL_WEBHOOK_SECRET_DEV=secret_dev_xxx
```

## Troubleshooting

### Webhook Not Firing
- Verify you're on Pro or Enterprise plan
- Check event selection matches what you expect
- Ensure project scope includes your project
- Confirm endpoint is publicly accessible

### Signature Verification Failing
- Ensure you're using the raw request body
- Check you're using SHA1 (not SHA256)
- Verify the secret matches exactly (no extra spaces)
- Confirm header name is lowercase: `x-vercel-signature`

### Timeouts
- Vercel waits 30 seconds for response
- Return 200 immediately, process async
- Check your server logs for slow operations

### Missing Events
- Some events may be delayed during high load
- Check Vercel status page for issues
- Review webhook history in dashboard

## Security Best Practices

1. **Never expose your webhook secret**
   - Don't commit to version control
   - Use environment variables
   - Rotate if compromised

2. **Always verify signatures**
   - Reject requests without valid signatures
   - Use constant-time comparison

3. **Validate event data**
   - Check required fields exist
   - Validate IDs match expected format
   - Handle missing/null values gracefully

4. **Use HTTPS endpoints only**
   - HTTP endpoints are not allowed
   - Ensure valid SSL certificate

5. **Implement rate limiting**
   - Protect against webhook floods
   - Use per-IP or per-signature limiting