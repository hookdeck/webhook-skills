# Setting Up Shopify Webhooks

## Prerequisites

- Shopify Partner account (for apps) or store admin access (for custom integrations)
- Your application's webhook endpoint URL (must be HTTPS)

## Get Your Signing Secret

### For Shopify Apps

1. Go to [Shopify Partners Dashboard](https://partners.shopify.com/)
2. Select your app
3. Go to **App setup**
4. Find **Client credentials** section
5. Copy the **Client secret** (this is your HMAC signing key)

### For Custom Storefronts / Admin API

If using the Admin API directly:
1. Go to your store's Admin → **Settings** → **Apps and sales channels**
2. Click **Develop apps** → Create or select an app
3. Under **API credentials**, note the **Admin API access token**

## Register Your Endpoint

### Via Shopify Admin (Store Settings)

1. Go to **Settings** → **Notifications**
2. Scroll to **Webhooks** section
3. Click **Create webhook**
4. Select the event (e.g., `Order creation`)
5. Enter your endpoint URL
6. Select format (JSON recommended)
7. Select API version
8. Click **Save**

### Via Admin API

```bash
curl -X POST \
  "https://{shop}.myshopify.com/admin/api/2024-01/webhooks.json" \
  -H "X-Shopify-Access-Token: {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "topic": "orders/create",
      "address": "https://your-app.com/webhooks/shopify",
      "format": "json"
    }
  }'
```

### Via GraphQL API

```graphql
mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription {
      id
      topic
      endpoint {
        __typename
        ... on WebhookHttpEndpoint {
          callbackUrl
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

## Mandatory Webhooks for Apps

Shopify requires apps to handle these webhooks for GDPR compliance:

1. **customers/data_request** - Customer requests their personal data
2. **customers/redact** - Customer requests deletion of their data  
3. **shop/redact** - Store owner uninstalls app and requests data deletion

Configure these in your Partner Dashboard under **App setup** → **Compliance webhooks**.

## Test vs Production

Shopify development stores can be used for testing:

1. Create a development store in Partners Dashboard
2. Install your app on the development store
3. Trigger events (create orders, products, etc.)

For testing webhooks locally, use Hookdeck CLI:

```bash
hookdeck listen 3000 --path /webhooks/shopify
```

## Environment Variables

Store your credentials securely:

```bash
# .env
SHOPIFY_API_SECRET=your_client_secret_here
SHOPIFY_API_KEY=your_api_key_here
```

## Full Documentation

For complete setup instructions, see:
- [Shopify Webhooks Overview](https://shopify.dev/docs/apps/build/webhooks)
- [Configure Webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe)
- [Mandatory Webhooks](https://shopify.dev/docs/apps/build/webhooks/mandatory-webhooks)
