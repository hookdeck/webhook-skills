# Setting Up Paddle Webhooks

## Prerequisites

- Paddle account (sandbox mode works for development)
- Your application's webhook endpoint URL (must be HTTPS in production)

## Create a Notification Destination

Paddle uses "notification destinations" to configure where webhooks are sent.

### Via Paddle Dashboard

1. Go to **Paddle Dashboard → Developer tools → Notifications**
2. Click **New destination**
3. Enter the details for your notification destination:
   - **Description**: Short description (e.g., "Production webhook handler")
   - **Notification type**: Select **URL** for webhooks
   - **URL**: Enter your endpoint URL (e.g., `https://your-app.com/webhooks/paddle`)
   - **API version**: Select the API version for event payloads
   - **Usage type**: Choose whether to receive real events, simulation events, or both
4. Choose the events you want to receive notifications for
5. Click **Save destination**

### Via Paddle API

```bash
curl -X POST https://api.paddle.com/notification-settings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Production webhooks",
    "destination": "https://your-app.com/webhooks/paddle",
    "subscribed_events": [
      {"event_type": "subscription.created"},
      {"event_type": "subscription.canceled"},
      {"event_type": "transaction.completed"}
    ],
    "type": "url"
  }'
```

## Get Your Webhook Secret Key

The webhook secret (endpoint secret key) is used to verify that webhook requests actually come from Paddle.

### Via Dashboard

1. Go to **Paddle Dashboard → Developer tools → Notifications**
2. Click the overflow button (⋮) next to your notification destination
3. Choose **Edit destination** or **View**
4. Under the destination details, find and reveal the **Secret key**

### Via API

```bash
curl https://api.paddle.com/notification-settings/{notification_setting_id} \
  -H "Authorization: Bearer YOUR_API_KEY"
```

The response includes `endpoint_secret_key`.

## Recommended Events for Common Use Cases

**Subscriptions:**
- `subscription.created`
- `subscription.activated`
- `subscription.updated`
- `subscription.canceled`
- `subscription.paused`
- `subscription.resumed`

**Transactions:**
- `transaction.completed`
- `transaction.payment_failed`
- `transaction.billed`

**Customers:**
- `customer.created`
- `customer.updated`

## Sandbox vs Live Mode

Paddle maintains separate environments:

- **Sandbox**: Use for development and testing. Transactions are simulated, no real money involved.
- **Live**: Production environment with real transactions.

Each environment has:
- Different API endpoints (`sandbox-api.paddle.com` vs `api.paddle.com`)
- Different webhook IP addresses (allowlist accordingly)
- Separate notification destinations and secrets

## IP Address Allowlisting

For security, you should allowlist Paddle's webhook IP addresses:

**Sandbox:**
```
34.194.127.46
54.234.237.108
3.208.120.145
44.226.236.210
44.241.183.62
100.20.172.113
```

**Live:**
```
34.232.58.13
34.195.105.136
34.237.3.244
35.155.119.135
52.11.166.252
34.212.5.7
```

## Environment Variables

Store your webhook secret securely:

```bash
# .env
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxx_xxxxx
```

Never commit secrets to version control. Use environment variables or a secrets manager.

## Full Documentation

For complete setup instructions, see [Paddle Webhooks Documentation](https://developer.paddle.com/webhooks/overview).
