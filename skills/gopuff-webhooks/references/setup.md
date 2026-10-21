# Setting Up Gopuff Webhooks

## Prerequisites

- A Powered by Gopuff partner account with `Gopuff-Partner` identifier and `Gopuff-Access-Token`
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 gopuff --path /webhooks/gopuff` locally)

## Get the Svix App Portal Link

```bash
curl -X POST 'https://fulfillment.partners.gopuff.dev/devportal/v1/webhooks/app-portal-link' \
  -H 'Content-Type: application/json' \
  -H 'Gopuff-Partner: <your partner id>' \
  -H 'Gopuff-Access-Token: <your token>'
```

Returns `{ "url": "https://app.svix.com/login?..." }` (200), or 401 on bad credentials. The link expires after 24 hours.

## Register Your Endpoint and Get the Signing Secret

1. Open the link, go to **Endpoints** and add your URL (e.g. `https://example.com/webhooks/gopuff`).
2. Select event types: `order.status.v2` (use this instead of `order.status`) and `order.delivered`, plus any delivery events you need.
3. Open the endpoint and copy the **Signing Secret** (`whsec_...`) into `GOPUFF_WEBHOOK_SECRET`.

Use the portal to view delivery history, debug failures and replay events.

## Test Mode vs Live Mode

In the Dev environment only the `Cancelled` order status can be triggered, via the cancel order API endpoint.
