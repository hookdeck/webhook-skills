# Setting Up GoCardless Webhooks

## Prerequisites

- A GoCardless account (use the **Sandbox** environment for testing)
- Your application's publicly reachable webhook endpoint URL (or a
  [Hookdeck CLI](https://hookdeck.com/docs/cli) / tunnel URL for local development)

## Create a Webhook Endpoint

1. Log in to the [GoCardless Dashboard](https://manage.gocardless.com/)
   (or the [Sandbox Dashboard](https://manage-sandbox.gocardless.com/) for testing).
2. Go to **Developers → Webhooks**.
3. Click **Create webhook endpoint**.
4. Enter your endpoint **URL**, e.g. `https://your-app.com/webhooks/gocardless`.
5. Save the endpoint.

## Get Your Webhook Endpoint Secret

When you create a webhook endpoint, GoCardless generates a **secret** for it. This
secret is used to sign every request to that endpoint (HMAC-SHA256).

1. In **Developers → Webhooks**, open your endpoint.
2. Copy the **secret**.
3. Store it as an environment variable — never commit it:

   ```bash
   GOCARDLESS_WEBHOOK_SECRET=your_webhook_endpoint_secret
   ```

The value in `GOCARDLESS_WEBHOOK_SECRET` must exactly match the endpoint's secret.
GoCardless recommends changing it periodically from the Dashboard; update the
environment variable at the same time.

## Sandbox vs Live

- **Sandbox** (`manage-sandbox.gocardless.com`) — use for development and testing.
  Create test payments/mandates and watch the resulting webhook events.
- **Live** (`manage.gocardless.com`) — real money movement.

Each environment has its own webhook endpoints and secrets. Configure the correct
`GOCARDLESS_WEBHOOK_SECRET` per environment.

## Retries and Delivery

- GoCardless expects a **2xx** response within **10 seconds** (return `204 No Content`).
- If your endpoint returns any other non-2xx or times out, GoCardless retries
  automatically: **9 delivery attempts in all** (1 + 8 retries) at increasing
  intervals. It doesn't publish the exact schedule.
- A `498` (bad signature) is logged and **not** retried.
- You can also retry a webhook from the Dashboard (Developers → Webhooks, which
  keeps 3 months of history) or via the API: `POST /webhooks/{id}/actions/retry`
  (the `gocardless-nodejs` SDK exposes this as `webhooks.retry(id)`).
- Delivery is at-least-once and the same event can appear in more than one
  webhook, so keep handlers **idempotent on `event.id`**.

## Testing Locally

Use the Hookdeck CLI to receive live GoCardless webhooks on your local machine
without deploying:

```bash
npx hookdeck-cli listen 3000 gocardless --path /webhooks/gocardless
```

Then set your GoCardless webhook endpoint URL to the tunnel URL the CLI prints.
Use port `8000` for the FastAPI example.
