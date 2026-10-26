# Setting Up BlindPay Webhooks

## Prerequisites

- A BlindPay account with an instance
- A public HTTPS URL for your endpoint (use `npx hookdeck-cli listen 3000 blindpay --path /webhooks/blindpay` while developing)

## Register Your Endpoint

You can have up to 25 HTTPS endpoints per instance.

**Dashboard:** open your instance, go to **Webhooks**, and add the endpoint URL.

**API:** `POST /v1/instances/{instance}/webhook-endpoints` with the URL and an `events` array. An empty `events` array subscribes the endpoint to every event.

Recommended events to start with: `payin.complete`, `payout.complete`, `customer.update`, `transfer.complete`, `wallet.inbound`.

## Get Your Signing Secret

Each endpoint has its own secret of the form `whsec_<base64>`.

- **Dashboard:** instance → **Webhooks** → endpoint menu → **Get secret**.
- **API:** `GET /v1/instances/{instance}/webhook-endpoints/{we_id}/secret` returns `{ "key": "whsec_..." }`.

Set the full value (including `whsec_`) as `BLINDPAY_WEBHOOK_SECRET`.

## Test and Replay

No challenge or validation request is sent when you add an endpoint. Inspect deliveries and replay them (same payload) from the dashboard's Events view or the Svix portal.

## Retries

Non-2xx responses are retried with backoff over hours. `svix-id` is the same on every retry, so use it to deduplicate.
