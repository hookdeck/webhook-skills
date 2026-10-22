# Setting Up Fourthwall Webhooks

## Prerequisites

- A Fourthwall shop with dashboard access
- Your application's HTTPS webhook endpoint URL (use `npx hookdeck-cli listen 3000 fourthwall --path /webhooks/fourthwall` for local development)

## Get Your Secret Key

1. Open your Fourthwall dashboard and go to **Settings > For developers** (the webhook configuration panel).
2. Find the **secret key** assigned to your shop. It looks like `e3f93c7c-c92b-4b8f-a9b1-5b70e0891abc`.
3. Store it as `FOURTHWALL_WEBHOOK_SECRET`. Use the value exactly as shown (as UTF-8 text); do not base64-decode or hex-decode it.

If you create webhooks through the API, the create response includes the same value in its `secret` field. Store it then.

## Register Your Endpoint

### Via the Dashboard

1. In **Settings > For developers**, open the webhook list and add a webhook.
2. Enter your HTTPS endpoint URL (for example `https://your-server.com/webhooks/fourthwall`).
3. Select the event types to receive, such as `ORDER_PLACED`, `ORDER_UPDATED`, `DONATION`, `GIFT_PURCHASE`, `SUBSCRIPTION_PURCHASED`.

### Via the Platform API

```bash
curl -u "your_username:your_password" \
  -X POST "https://api.fourthwall.com/open-api/v1.0/webhooks" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhooks/fourthwall",
    "allowedTypes": ["ORDER_PLACED", "ORDER_UPDATED", "DONATION"]
  }'
```

The Platform API authenticates with HTTP Basic Auth. Webhook deliveries to your endpoint carry no API key or basic auth; the HMAC signature is the authentication. The API also supports `GET /webhooks`, `GET /webhooks/{id}`, `PUT /webhooks/{id}` and `DELETE /webhooks/{id}`.

## Testing

- Click **Send test notification** on the webhook list. The event has `"testMode": true`.
- Or perform the real action in your shop, such as placing an order while subscribed to `ORDER_PLACED`.

## Platform App Webhooks

Webhooks for Platform Apps are configured in the app's settings and signed with the app's HMAC key in the `X-Fourthwall-Hmac-Apps-SHA256` header. This skill does not cover them; the algorithm is the same, only the header and key differ.

## Delivery Behavior

Respond `200 OK` within 2 seconds. Failed deliveries are retried (5 attempts, 5-second timeout each). Delivery is at-least-once with no ordering guarantee between topics, so deduplicate on the event `id`.
