# Setting Up Knock Webhooks

## Prerequisites

- A Knock account with access to the dashboard
- A publicly reachable HTTPS URL for your webhook endpoint (use `npx hookdeck-cli listen 3000 knock --path /webhooks/knock` for local development)

## Create the Endpoint

1. In the [Knock dashboard](https://dashboard.knock.app/), open **Developers → Webhooks**.
2. Click **Create endpoint** (or **Add endpoint**).
3. Enter your endpoint URL — for production, this is your service URL (e.g. `https://api.example.com/webhooks/knock`). For local development, paste the Hookdeck CLI URL.
4. Select the **environment** (e.g. Development, Staging, Production). Webhooks are scoped per environment.
5. Subscribe to the event types you want to receive. Common starter sets:
   - **Delivery monitoring:** `message.sent`, `message.delivered`, `message.undelivered`, `message.bounced`
   - **Engagement analytics:** `message.seen`, `message.read`, `message.link_clicked`, `message.interacted`
   - **Resource changes (CI/CD):** `workflow.committed`, `email_layout.committed`, `translation.committed`
6. Save the endpoint.

## Get the Signing Secret

1. Open the endpoint you just created.
2. Find the **Signing secret** field on the endpoint detail page.
3. Click **Reveal** (or the equivalent) to see the secret value.
4. Copy the value into your environment as `KNOCK_WEBHOOK_SECRET`.

> **Important:** This signing secret is **per webhook endpoint**, not the Knock account API key. Each endpoint has its own secret. If you create separate endpoints for separate environments (recommended), each will have its own secret.

## Send a Test Event

Most Knock environments emit real events as soon as a workflow is triggered, but to test the wiring without sending a real notification:

1. From the endpoint detail page, click **Send test event** (or trigger any workflow in your Knock environment).
2. Observe the request in your Hookdeck CLI terminal (or in the Hookdeck dashboard).
3. Confirm your handler returns `200` and the signature verifies. See [verification.md](verification.md) for debugging tips.

## Environment Separation

Knock has separate environments (Development / Staging / Production). Best practice:

- One webhook endpoint per environment.
- One `KNOCK_WEBHOOK_SECRET` per deployed environment of your service.
- Never share a production signing secret with non-production deployments.

## Retries and Delivery Guarantees

- Knock retries up to **8 times** on any non-2xx response.
- Delivery is **at-least-once** — design your handler to be idempotent on the top-level event `id`.
- Retry backoff is exponential; see [Knock's outbound webhooks documentation](https://docs.knock.app/developer-tools/outbound-webhooks/overview) for current schedule.
