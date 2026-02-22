# Setting Up Webflow Webhooks

## Prerequisites

- A Webflow account with an active site
- For signature verification: OAuth app or API access
- Your application's webhook endpoint URL (must be HTTPS in production)

## Two Ways to Create Webhooks

### 1. Via Webflow Dashboard (No Signature Verification)

⚠️ **Note**: Webhooks created through the dashboard do NOT include signature headers for verification.

1. Go to your Webflow project
2. Navigate to **Project Settings** → **Integrations** → **Webhooks**
3. Click **Add Webhook**
4. Select the trigger event
5. Enter your endpoint URL
6. Save the webhook

### 2. Via API (Recommended - Includes Signatures)

This method provides signature headers for secure verification.

#### Get Your API Credentials

**For OAuth Apps:**
1. Go to [Webflow Dashboard](https://webflow.com/dashboard/account/apps)
2. Create or select your app
3. Note your **Client ID** and **Client Secret**
4. The Client Secret will be your webhook signing secret

**For Site API Tokens:**
1. Go to **Project Settings** → **Integrations** → **API Access**
2. Generate a site token
3. For webhooks created after April 2025, you'll receive a webhook-specific secret

#### Create Webhook via API

```bash
curl -X POST https://api.webflow.com/sites/{site_id}/webhooks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "triggerType": "form_submission",
    "url": "https://your-app.com/webhooks/webflow",
    "filter": {
      "name": "contact-form"
    }
  }'
```

Response (for webhooks after April 2025):
```json
{
  "id": "65a5d7a8f7e2b40012345684",
  "triggerType": "form_submission",
  "url": "https://your-app.com/webhooks/webflow",
  "secret": "whsec_1234567890abcdef",
  "createdOn": "2024-01-15T14:45:00.000Z"
}
```

Save the `secret` field - this is your webhook signing secret.

## Required Scopes

Different webhook types require different API scopes:

| Webhook Type | Required Scope |
|--------------|----------------|
| `form_submission` | `forms:read` |
| `ecomm_*` events | `ecommerce:read` |
| `collection_item_*` | `cms:read` |
| `page_*` events | `pages:read` |
| `site_publish` | `sites:read` |
| `user_account_*` | `users:read` |

## Managing Webhooks

### List Existing Webhooks

```bash
curl -X GET https://api.webflow.com/sites/{site_id}/webhooks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update a Webhook

```bash
curl -X PATCH https://api.webflow.com/webhooks/{webhook_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-new-endpoint.com/webhooks/webflow"
  }'
```

### Delete a Webhook

```bash
curl -X DELETE https://api.webflow.com/webhooks/{webhook_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Testing Your Webhook

### 1. Local Development with Hookdeck

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Create a tunnel to your local server
hookdeck listen 3000 --path /webhooks/webflow
```

### 2. Test Events

**Form Submission Test:**
1. Create a test form on your Webflow site
2. Publish the site
3. Submit the form
4. Check your webhook endpoint logs

**CMS Event Test:**
1. Create or update a CMS item
2. Publish the changes
3. Verify webhook delivery

## Environment Setup

Create a `.env` file for your application:

```bash
# For OAuth App webhooks
WEBFLOW_WEBHOOK_SECRET=your_oauth_client_secret

# For API-created webhooks (after April 2025)
WEBFLOW_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Optional: For making API calls
WEBFLOW_API_TOKEN=your_api_token
WEBFLOW_SITE_ID=your_site_id
```

## Troubleshooting

### Webhook Not Firing
- Ensure the site is published (draft changes don't trigger webhooks)
- Check the webhook is enabled in settings
- Verify your endpoint returns a 200 status

### Signature Verification Failing
- Confirm you're using the raw request body (not parsed JSON)
- Check you're using the correct secret (OAuth client secret vs webhook secret)
- Verify headers are lowercase in your framework (some normalize to lowercase)
- Ensure timestamp is within 5-minute window

### Missing Headers
- Dashboard-created webhooks don't include signature headers
- Only OAuth app or API-created webhooks have `x-webflow-signature` and `x-webflow-timestamp`

## Best Practices

1. **Always verify signatures** for webhooks that include them
2. **Validate timestamps** to prevent replay attacks
3. **Return 200 quickly** to avoid timeouts (process async if needed)
4. **Log raw payloads** during development for debugging
5. **Use HTTPS** for production endpoints
6. **Handle retries** - Webflow retries failed webhooks up to 3 times