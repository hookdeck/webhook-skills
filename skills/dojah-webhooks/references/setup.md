# Setting Up Dojah Webhooks

## Prerequisites

- A Dojah account with an app (App ID) and access to the Developers page
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Webhook Secret

Paste the webhook secret from Developers > Webhooks, not your API secret key.

1. In the Dojah dashboard open **Developers → Webhooks**.
2. Find your subscription and reveal the value in the **Secret** column with the eye icon.
3. Store it as `DOJAH_WEBHOOK_SECRET`.

Each subscription has its own secret. Signing with the API secret key will not match `x-dojah-signature`.

## Register Your Endpoint

### Option 1: Dashboard

1. Open **Developers → Webhooks** and select **Subscribe**.
2. Choose the app, enter your **Webhook URL**, and pick the service (for example KYC Widget).

### Option 2: API

```bash
curl -X POST "https://api.dojah.io/api/v1/webhook/subscribe" \
  -H "Authorization: $DOJAH_SECRET_KEY" \
  -H "AppId: $DOJAH_APP_ID" \
  -H "Content-Type: application/json" \
  -d '{ "webhook": "https://yourapp.com/webhooks/dojah", "service": "kyc_widget" }'
```

`Authorization` is your app's secret key sent as-is (no `Bearer`). `service` is one of `kyc_widget`, `sms`,
`address` or `AML Monitoring`. There is one subscription per service per environment. You can also fetch and
delete subscriptions through the webhook management endpoints.

## Sandbox vs Live

The Webhooks tab lists an **Environment** (Live or Sandbox) per subscription, so subscribe separately for each,
each with its own secret.

## Using Hookdeck

Create a source of type `Dojah` in Hookdeck and paste the webhook secret there; Hookdeck's source verifies
`x-dojah-signature`. Use the source URL as the webhook URL.

## Local Development

```bash
npx hookdeck-cli listen 3000 dojah --path /webhooks/dojah
```
