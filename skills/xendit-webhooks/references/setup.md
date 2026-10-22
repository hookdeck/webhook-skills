# Setting Up Xendit Webhooks

## Prerequisites

- A Xendit account (a Developer permission is needed to resend events)
- A public HTTPS endpoint, for example `https://example.com/webhooks/xendit`

## Get Your Verification Token

1. Open the Xendit Dashboard and go to **Settings > Webhooks** (the page is titled Webhook settings).
2. Copy the **webhook verification token**.
3. Store it as `XENDIT_CALLBACK_TOKEN`. Keep it secret: anyone with it can forge webhooks.

Xendit sends this exact value in the `x-callback-token` header of every webhook, for every product.

## Register Your Endpoint

1. On the same Webhooks page, paste your endpoint URL into the field for each product you use (invoices, virtual accounts, e-wallets, payouts and so on). Payments API events are sent to the URL for the Payments API.
2. Save. Use the dashboard's test button to send a sample event, and the Webhook tab to see delivery history and status codes.

For local development:

```bash
npx hookdeck-cli listen 3000 xendit --path /webhooks/xendit
```

## Test Mode vs Live Mode

Xendit has separate test and live modes with their own data. Webhook URLs are configured per mode, and the verification token may differ, so set the URL and token for each mode you use.

## Resend Events

In the **Webhook** tab, open an event and click **Resend**, or use **Custom Resend** to replay a filtered batch (maximum 500). Useful after downtime.
