# Setting Up Tolt Webhooks

## Prerequisites

- A Tolt account with access to Settings
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Tolt Webhook Endpoint?

1. In the Tolt dashboard, go to **Settings → Webhooks**.
2. Add your endpoint URL, e.g. `https://example.com/webhooks/tolt`.
3. Pick the [events](https://docs.tolt.com/webhooks/event-types.md) to receive. A typical
   affiliate integration starts with `customer.created`, `transaction.created`,
   `commission.created` and `commission.updated`.
4. Return a `2xx` quickly from your handler. Save or queue the event and do slow work afterwards.
   Return `200` for events you don't handle, because failed or timed-out deliveries are retried.

No challenge or handshake is documented when you add an endpoint.

## Where Do I Find the Signing Secret?

Each endpoint gets its own secret when you add it (`whsec_...`). Copy it from
**Dashboard → Settings → Webhooks** and store the full value, prefix included, on your server:

```bash
TOLT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## One Secret Per Endpoint

A secret verifies only the endpoint it was issued for. If you register several endpoints (for
example staging and production), keep each endpoint's secret with its own deployment.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 tolt --path /webhooks/tolt   # use 8000 for FastAPI
```

Register the printed URL as the endpoint, then create a partner or a referral link in Tolt to
trigger `partner.created` or `link.created`. Hookdeck forwards each delivery with the original
Svix headers, so signature verification works unchanged.

## Why Does a Replay Fail With "Timestamp too old"?

A replay or retry resends the original `svix-id` and `svix-timestamp`. The `svix` library rejects
anything older than 5 minutes, even when the signature is valid. Use the manual verifier in
[verification.md](verification.md) to widen or drop the window, and deduplicate on `svix-id`.
