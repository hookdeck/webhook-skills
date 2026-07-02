# Setting Up GoCardless Webhooks

## Prerequisites

- A GoCardless account (use the **Sandbox** environment for testing)
- Your application's publicly reachable webhook endpoint URL (or a
  [Hookdeck CLI](https://hookdeck.com/docs/cli) / tunnel URL for local development)

## Create a Webhook Endpoint

1. Log in to the [GoCardless Dashboard](https://manage.gocardless.com/)
   (or the [Sandbox Dashboard](https://manage-sandbox.gocardless.com/) for testing).
2. Go to **Developers → Webhook endpoints**.
3. Click **Create webhook endpoint**.
4. Enter your endpoint **URL**, e.g. `https://your-app.com/webhooks/gocardless`.
5. Save the endpoint.

## Get Your Webhook Endpoint Secret

When you create a webhook endpoint, GoCardless generates a **secret** for it. This
secret is used to sign every request to that endpoint (HMAC-SHA256).

1. In **Developers → Webhook endpoints**, open your endpoint.
2. Copy the **secret**.
3. Store it as an environment variable — never commit it:

   ```bash
   GOCARDLESS_WEBHOOK_SECRET=your_webhook_endpoint_secret
   ```

You can also create webhook endpoints programmatically via the API, in which case
you supply your own secret. Either way, the value in `GOCARDLESS_WEBHOOK_SECRET`
must exactly match the endpoint's secret.

## Sandbox vs Live

- **Sandbox** (`manage-sandbox.gocardless.com`) — use for development and testing.
  Create test payments/mandates and watch the resulting webhook events.
- **Live** (`manage.gocardless.com`) — real money movement.

Each environment has its own webhook endpoints and secrets. Configure the correct
`GOCARDLESS_WEBHOOK_SECRET` per environment.

## Retries and Delivery

- GoCardless expects a **2xx** response (return `204 No Content`).
- If your endpoint returns a non-2xx status, times out, or is unreachable,
  GoCardless **retries the entire batch** with exponential backoff.
- Because the whole batch is retried, make handlers **idempotent on `event.id`**.
- You can view delivery attempts and manually retry from the Dashboard under the
  webhook endpoint.

## Testing Locally

Use the Hookdeck CLI to receive live GoCardless webhooks on your local machine
without deploying:

```bash
npx hookdeck-cli listen 3000 gocardless --path /webhooks/gocardless
```

Then set your GoCardless webhook endpoint URL to the tunnel URL the CLI prints.
Use port `8000` for the FastAPI example.
