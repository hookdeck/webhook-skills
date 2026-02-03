# Setting Up Resend Webhooks

## Prerequisites

- Resend account with API access
- Your application's webhook endpoint URL (must be HTTPS in production)

## Get Your Webhook Signing Secret

The webhook signing secret is used to verify that webhook requests actually come from Resend.

### Via Resend Dashboard

1. Go to [Resend Dashboard → Webhooks](https://resend.com/webhooks)
2. Click **Add Webhook**
3. Enter your endpoint URL (e.g., `https://your-app.com/webhooks/resend`)
4. Select the events you want to receive
5. Click **Add**
6. Click on your new webhook to view details
7. Copy the **Signing Secret** (`whsec_...`)

## Select Events to Receive

### Recommended Events for Email Tracking

- `email.sent` - Confirm email was accepted
- `email.delivered` - Confirm delivery to recipient
- `email.bounced` - Handle invalid addresses
- `email.complained` - Handle spam complaints

### For Inbound Email Processing

- `email.received` - Process incoming emails

### For Engagement Tracking

- `email.opened` - Track open rates
- `email.clicked` - Track click-through rates

## Setting Up Inbound Email

To receive emails at your domain via Resend:

### Option 1: Resend-Managed Domain (Fastest)

Use your auto-generated address: `<anything>@<your-id>.resend.app`

No DNS configuration needed. Find your address in Dashboard → Emails → Receiving → "Receiving address".

### Option 2: Custom Domain

Add an MX record to receive at `<anything>@yourdomain.com`:

| Setting | Value |
|---------|-------|
| Type | MX |
| Host | Your domain or subdomain |
| Value | Provided in Resend dashboard |
| Priority | 10 |

**Critical:** Your MX record must have the lowest priority number, or emails won't route to Resend.

### Subdomain Recommendation

If you already have MX records (e.g., Google Workspace, Microsoft 365), use a subdomain:

```
# Receive at support.yourdomain.com without affecting yourdomain.com
support.yourdomain.com.  MX  10  <resend-mx-value>
```

**Warning:** Setting up Resend on a root domain routes ALL email to Resend, which will break existing email services.

## Local Development

For local webhook testing, use a tunnel service. We recommend Hookdeck CLI:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Start tunnel (no account required)
hookdeck listen 3000 --path /webhooks/resend
```

This provides:
- A public URL to use in Resend dashboard
- Web UI for inspecting and replaying webhook requests
- Automatic retries for failed deliveries

Alternative: Use ngrok:
```bash
ngrok http 3000
# Use https://abc123.ngrok.io/webhooks/resend as endpoint
```

## Test Webhooks

Resend allows you to test webhook delivery from the dashboard:

1. Go to your webhook in the Dashboard
2. Click **Send Test**
3. Select an event type
4. Click **Send**

## Environment Variables

Store your credentials securely:

```bash
# .env
RESEND_API_KEY=re_your_api_key_here
RESEND_WEBHOOK_SECRET=whsec_your_signing_secret_here
```

Never commit secrets to version control. Use environment variables or a secrets manager.

## Full Documentation

For complete setup instructions, see [Resend Webhooks Documentation](https://resend.com/docs/webhooks).
