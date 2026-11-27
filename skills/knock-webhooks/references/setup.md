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
6. Click **Create webhook**. The webhook is enabled straight away.

You can also create webhooks with the Management API (`POST /v1/webhooks` with `url` and `event_types`, per environment).

## Get the Secret Key

1. Open the webhook you just created.
2. Copy the shared secret key from its **Overview** tab.
3. Store it in your environment as `KNOCK_WEBHOOK_SECRET`.

A webhook created with the Management API returns `secret_key` in the create response only, so save it then.

> **Important:** This secret key is **per webhook**, not the Knock account API key. A webhook belongs to one environment, so each environment's webhook has its own secret.

## Test the Wiring

Knock documents no test-event button. Trigger a workflow in the webhook's environment to generate real message events, then:

1. Watch the request arrive in your Hookdeck CLI terminal (or the Hookdeck dashboard).
2. Confirm your handler returns `200` and the signature verifies. See [verification.md](verification.md) for debugging tips.
3. Check the webhook's **Logs** tab in Knock for the status code your endpoint returned.

## Environment Separation

Knock has separate environments (Development / Staging / Production). Best practice:

- One webhook endpoint per environment.
- One `KNOCK_WEBHOOK_SECRET` per deployed environment of your service.
- Never share a production signing secret with non-production deployments.

## Retries and Delivery Guarantees

- Knock retries non-2xx responses **a handful of times over a few hours**. The exact number of attempts and the intervals are not fixed and can change; see [Knock's outbound webhooks documentation](https://docs.knock.app/developer-tools/outbound-webhooks/overview).
- Knock **never retries** `301`, `302`, `303`, `400`, `401`, `402`, `403`, `404`, or `405`. Return a `5xx` for transient failures you want retried.
- On a `429` with a well-formed `Retry-After` header, Knock does its best to respect that header.
- The same event can arrive more than once. The payload has no event-level `id`, and `type` plus the entity ID repeats on real events, so write state changes as idempotent upserts. For `commits.promoted`, deduplicate on the promote group ID (`data.id`).
