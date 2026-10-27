# Setting Up Cashfree Webhooks

## Prerequisites

- A Cashfree merchant account with access to the product you use (Payment Gateway, Payouts V2, Secure ID or PPI)
- A public HTTPS endpoint (for local development, use the Hookdeck CLI below)

## What Do I Paste Into Hookdeck?

Paste your Cashfree client secret (the Partner API key for partner webhooks). Legacy Payouts V1 and Cashgram webhooks use another scheme and fail verification.

In Hookdeck, create a source with the **Cashfree** source type and paste that value as the secret. In your own handler, put the same value in `CASHFREE_WEBHOOK_SECRET`.

## Where Do I Get the Signing Secret?

Cashfree signs with your **client secret** (the `x-client-secret` credential of your API key pair). There is no separate per-endpoint signing secret. For partner-level webhooks, use the Partner API key.

Treat it like any API secret: keep it server side, and note that rotating the client secret changes the signing key.

## How Do I Register an Endpoint?

1. Open the Merchant Dashboard and go to the developer settings of the product you use.
2. Choose **Add Webhook Endpoint** and enter your HTTPS URL, for example `https://your-app.com/webhooks/cashfree`.
3. Click **Test** to verify the endpoint answers.
4. Pick a retry policy and the events to subscribe to (for example `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `REFUND_STATUS_WEBHOOK`), then save.

Dashboard paths differ per product; see [Configure webhook endpoints](https://www.cashfree.com/docs/api-reference/webhooks/overview).

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 cashfree --path /webhooks/cashfree

# FastAPI
npx hookdeck-cli listen 8000 cashfree --path /webhooks/cashfree
```

Register the printed URL as your Cashfree webhook endpoint.

## Test vs Production

Cashfree has sandbox and production environments with separate credentials, so each has its own client secret. Use the secret that matches the environment sending the webhook.
