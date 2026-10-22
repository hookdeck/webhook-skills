# Setting Up Kustomer Webhooks

## Prerequisites

- Kustomer account with Admin access (only admins see the Outbound webhooks page)
- Your application's webhook endpoint URL (HTTPS)

## Create the Webhook and Get Your Secret

1. Go to **Settings > Platform > Outbound webhooks**.
2. Select **Add Outbound Webhook**.
3. Enter a **name** and the **Destination URL**.
4. Under **Webhook Trigger Events**, choose any of: Conversation Create/Update, Customer Create/Update, Message Create/Update, Team Create/Update, User Create/Update.
5. Select **Save Changes**.
6. The secret is generated only after the first save. Reopen the webhook with **Edit** and scroll to **Header Information** to copy it.

Store it as `KUSTOMER_WEBHOOK_SECRET`.

## Create via the API

`POST /v1/outbound-webhooks` with a Kustomer API key that has the `org.permission.outbound_webhook` permission. The response body has a `token` field: that is the HMAC secret.

## Local Development

```bash
npx hookdeck-cli listen 3000 kustomer --path /webhooks/kustomer
```

Use the Hookdeck URL it prints as the Destination URL.

## Keep It Enabled

Kustomer disables a webhook after 10 consecutive failed deliveries (about 80 minutes) and does not notify you. Return a 2xx within a few seconds, process in the background, and re-enable under **Settings > Platform > Outbound Webhooks** if it stops. Diagnose failures in **Settings > Platform > Org Logging** or `GET /v1/logs/search/outbound-webhook`.

## Testing

Kustomer has no "send test event" button. Create or update a customer or conversation in your org to trigger a delivery.
