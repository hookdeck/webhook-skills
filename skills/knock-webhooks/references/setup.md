# Setting Up Knock Webhooks

## Prerequisites

- A Knock account with access to the dashboard
- A publicly reachable HTTPS URL for your webhook endpoint (use `npx hookdeck-cli listen 3000 knock --path /webhooks/knock` for local development)

## Create the Endpoint

1. In the [Knock dashboard](https://dashboard.knock.app/), switch to the **environment** the webhook should belong to (e.g. Development or Production). A webhook is created in the environment you're currently in and only fires for that environment; to use it elsewhere, create it again there.
2. Open **Webhooks** in the sidebar under **Platform**, then click **Create webhook**.
3. Enter your endpoint URL — for production, this is your service URL (e.g. `https://api.example.com/webhooks/knock`). For local development, paste the Hookdeck CLI URL.
4. Optionally add a description.
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

- Knock retries non-2xx responses **a handful of times over a few hours**. The exact number of attempts and the intervals are not fixed and can change; see [Knock's outbound webhooks documentation](https://docs.knock.app/developer-tools/outbound-webhooks/overview).
- Knock **never retries** `301`, `302`, `303`, `400`, `401`, `402`, `403`, `404`, or `405`. Return a `5xx` for transient failures you want retried.
- On a `429` with a well-formed `Retry-After` header, Knock does its best to respect that header.
- Delivery is **at-least-once**. The payload has no event-level `id`, so make your handler idempotent on a key built from `type`, the entity in `data` (`data.id` for message events), and `created_at`.
