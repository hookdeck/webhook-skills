# Setting Up WorkOS Webhooks

## Prerequisites

- A [WorkOS account](https://dashboard.workos.com/) with admin access
- Your application's publicly reachable webhook endpoint URL
  (e.g. `https://api.example.com/webhooks/workos`)

## Register Your Endpoint

1. Go to the [WorkOS Dashboard](https://dashboard.workos.com/).
2. Open **Webhooks** (under **Configuration** / developer settings).
3. Click **Create Endpoint**.
4. Enter your endpoint URL, e.g. `https://api.example.com/webhooks/workos`.
5. Select the events you want to receive — only subscribe to the ones your
   integration needs (e.g. `dsync.user.created`, `dsync.group.user_added`,
   `connection.activated`, `user.created`, `session.created`).
6. Save the endpoint.

## Get Your Signing Secret

When you create the endpoint, WorkOS generates a **signing secret** for it.

1. In the Dashboard, open the webhook endpoint you just created.
2. Copy the **Signing Secret**.
3. Store it as an environment variable on your server — never commit it:

   ```bash
   WORKOS_WEBHOOK_SECRET=your_endpoint_signing_secret
   ```

Each endpoint has its own signing secret. If you have multiple endpoints, keep
each secret with the code that handles that endpoint.

You also need a WorkOS **API key** (Dashboard → **API Keys**) to construct the
SDK client:

```bash
WORKOS_API_KEY=sk_test_xxxxx    # sk_test_... in the staging env, sk_live_... in production
```

## Test Your Endpoint

- The WorkOS Dashboard webhook view lets you **send a test event** and inspect
  delivery attempts, response status codes, and retries.
- For local development, tunnel the events to your machine with the Hookdeck CLI
  (no account required):

  ```bash
  npx hookdeck-cli listen 3000 workos --path /webhooks/workos
  ```

  Point the WorkOS endpoint URL at the tunnel URL the CLI prints.

## Delivery & Retries

- WorkOS expects a `2xx` response. Return `200` quickly after verifying the
  signature; do heavy work asynchronously.
- Non-`2xx` responses (or timeouts) are retried by WorkOS with backoff.
- Because retries can redeliver the same event, handle events **idempotently**
  using the event `id`.

## Staging vs Production

WorkOS environments (Staging / Production) are separate. Configure webhook
endpoints and copy the signing secret **per environment**, and use the matching
`sk_test_` / `sk_live_` API key for each.
