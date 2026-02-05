# Setting Up FusionAuth Webhooks

## Prerequisites

- FusionAuth instance (self-hosted or cloud)
- Your application's webhook endpoint URL (must be HTTPS in production)
- A signing key configured in Key Master (for signature verification)

## Step 1: Create a Signing Key

FusionAuth signs webhooks using keys from Key Master. For HMAC signing:

1. Navigate to **Settings → Key Master**
2. Click **Add** or **Generate**
3. Select **HMAC** key type
4. Enter a name (e.g., "Webhook Signing Key")
5. Choose algorithm: **HS256**, **HS384**, or **HS512**
6. Either generate a key or enter your own secret
7. Click **Save**
8. **Copy the HMAC secret** - you'll need this in your webhook handler

For asymmetric keys (RSA, EC, EdDSA), the public key can be fetched from FusionAuth's `/.well-known/jwks.json` endpoint.

## Step 2: Enable Events at Tenant Level

1. Navigate to **Tenants → [Your Tenant] → Webhooks**
2. Enable the events you want to receive
3. Configure transaction settings for each event type

### Recommended Events by Use Case

**User Lifecycle:**
- `user.create`
- `user.update`
- `user.delete`
- `user.deactivate`
- `user.reactivate`

**Authentication Monitoring:**
- `user.login.success`
- `user.login.failed`

**Registration Management:**
- `user.registration.create`
- `user.registration.update`
- `user.registration.delete`

**Email Verification:**
- `user.email.verified`
- `user.registration.verified`

## Step 3: Create Webhook Endpoint

1. Navigate to **Settings → Webhooks**
2. Click **Add** (+ icon)
3. Configure the webhook:

### Basic Settings

| Field | Description |
|-------|-------------|
| **URL** | Your webhook endpoint (e.g., `https://your-app.com/webhooks/fusionauth`) |
| **Connect timeout** | HTTP connect timeout in milliseconds (default: 1000) |
| **Read timeout** | HTTP read timeout in milliseconds (default: 2000) |
| **Description** | Optional description |

### Security Settings

1. Click the **Security** tab
2. Enable **Sign events** toggle
3. Select your signing key from the dropdown
4. Optionally configure:
   - **Basic auth username/password** for additional authentication
   - **SSL certificate** for mutual TLS

### Tenant Assignment

1. Click the **Tenants** tab
2. Choose **All tenants** or select specific tenants

### Event Selection

1. Click the **Events** tab
2. Enable specific events for this webhook
3. Events must also be enabled at the tenant level to be sent

## Step 4: Test Your Webhook

1. Click the **Test** button (purple icon) next to your webhook
2. Select an event type to test
3. Optionally modify the JSON payload
4. Click **Send** to test delivery

## Environment Variables

Store your configuration securely:

```bash
# .env
FUSIONAUTH_WEBHOOK_SECRET=your_hmac_secret_key_here
FUSIONAUTH_URL=https://your-fusionauth-instance.com
```

## Custom HTTP Headers

You can add custom headers that FusionAuth will include in every webhook request:

1. In webhook settings, click **Headers** tab
2. Add header name and value
3. Useful for API keys or routing identifiers

## Webhook Response Requirements

Your webhook handler must:
- Return HTTP status `200-299` for success
- Respond within the configured timeout
- Handle retries idempotently (same event may be sent multiple times)

If your webhook fails and transaction settings require success, the originating FusionAuth operation will fail with HTTP 504.

## Full Documentation

For complete setup instructions, see:
- [FusionAuth Webhooks Documentation](https://fusionauth.io/docs/extend/events-and-webhooks/)
- [Securing Webhooks](https://fusionauth.io/docs/extend/events-and-webhooks/securing)
- [Signing Webhooks](https://fusionauth.io/docs/extend/events-and-webhooks/signing)
