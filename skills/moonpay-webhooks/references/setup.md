# Setting Up MoonPay Webhooks

## Prerequisites

- A MoonPay account with dashboard access
- A public HTTPS endpoint (e.g. `https://your-app.com/webhooks/moonpay`)

## Get Your Webhook API Key

1. Open the [Developers page](https://dashboard.moonpay.com/developers/) of the MoonPay dashboard.
2. Copy the **webhook API key** (e.g. `wk_test_...` for test mode, `wk_live_...` for live mode).
3. Store it server-side as `MOONPAY_WEBHOOK_API_KEY`. It is the HMAC key and must never reach the client.

## Register Your Endpoint

1. Go to [Webhook settings](https://dashboard.moonpay.com/developers/#webhooks) and click **Add Endpoint**.
2. Enter your HTTPS URL.
3. Choose all event types or specific ones (e.g. `transaction_created`, `transaction_updated`, `transaction_failed`, `sell_transaction_created`, `identity_check_updated`).
4. Create one setting for test mode and one for live mode; they can share a URL, but verify each with its own key.

## Test Mode vs Live Mode

Test or live API keys decide whether test or live events reach the URL. Use test mode first.

## Local Development

```bash
npx hookdeck-cli listen 3000 moonpay --path /webhooks/moonpay
```

Use the tunnel URL as the endpoint URL. For FastAPI use port `8000`.

## Allowlisting

If you firewall your endpoint, allow MoonPay's IPv4 addresses listed in [overview.md](overview.md).
