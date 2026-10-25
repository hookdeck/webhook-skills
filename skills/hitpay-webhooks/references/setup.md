# Setting Up HitPay Webhooks

## Prerequisites

- A HitPay account
- A public HTTPS endpoint, for example `https://example.com/webhooks/hitpay` (loopback and private network addresses are rejected)

## Get Your Salt

1. Open the HitPay dashboard and go to **Developers > Webhooks**.
2. Create a webhook (a name and the URL). Its detail view then shows that webhook's **salt**.
3. Store it as `HITPAY_WEBHOOK_SALT`.

Each webhook endpoint has its own salt. Do **not** use the API-key salt shown on the main Developers page next to your API key: that one signs the legacy payment-request and charge callbacks (an `hmac` field in the payload), which this skill does not cover.

## Register Your Endpoint

1. Enter the name and URL under Developers > Webhooks (the API can do the same with `POST /v1/webhook-events` and `PUT /v1/webhook-events/{webhook_event_id}`).
2. Deliveries carry `Hitpay-Signature`, `Hitpay-Event-Object` and `Hitpay-Event-Type` headers.

For local development:

```bash
npx hookdeck-cli listen 3000 hitpay --path /webhooks/hitpay
```

Paste the printed URL as the webhook URL.

## Using Hookdeck

Only HitPay App webhooks (Developers > Webhooks), which send a `Hitpay-Signature` header, are supported. Create the Hookdeck source with the `hitpay` type and paste that webhook's salt as the source's webhook secret. Legacy payment-request callbacks aren't supported.

## Platform Accounts

A Platform Account does not send webhooks until the platform registers endpoints on its own HitPay account. See [overview.md](overview.md#platform-accounts) for which account receives which events.

## Sandbox

HitPay has a Sandbox for testing; register the webhook in the sandbox dashboard, which has its own salt.
