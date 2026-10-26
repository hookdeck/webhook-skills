# Setting Up Recurrente Webhooks

## Prerequisites

- A Recurrente account (use a Sandbox to test without moving money)
- A publicly reachable endpoint URL. Private, local, and metadata addresses are rejected, so use
  the Hookdeck CLI tunnel for local work

## How Do I Register a Recurrente Webhook Endpoint?

**In the dashboard:** go to **Configuración** > **Desarrolladores y API**, click **Webhooks**, and
add the URL where you want to receive requests, e.g. `https://example.com/webhooks/recurrente`.

**Via the API:**

```bash
curl -X POST https://app.recurrente.com/api/webhook_endpoints \
  -H "X-SECRET-KEY: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/recurrente",
    "description": "Production webhook"
  }'
```

You can register several URLs (production, staging, logging). Each event is sent to all of them,
and no per-endpoint event filter is documented. Return `200` for events you don't handle.

## Where Do I Find the Signing Secret?

Each endpoint has its own secret, in the form `whsec_...`.

- **Via the API:** the `signingSecret` field in the response to `POST /api/webhook_endpoints`. It
  is returned only in that response, so store it securely.
- **Via the dashboard:** at any time in the Svix dashboard, reachable from **Configuración >
  Desarrolladores y API > Webhooks**.

Store the full value, prefix included:

```bash
RECURRENTE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Test Mode vs Live Mode

A Sandbox sends webhooks without moving money. Paying a Sandbox checkout with card
`4242 4242 4242 4242` sends `intent.succeeded` (`type: payment`). Deliveries from a Sandbox go only
to endpoints registered with that Sandbox's **TEST** key, so register a separate endpoint (with its
own secret) per environment. Sandboxes created before the unified-format change also send the
legacy `payment_intent.succeeded`. Test payments simulate cards only.

## Sending Test Events

Open the webhook dashboard and use the **Testing** tab to send an example of any catalog event to
your endpoint. The message view shows the payload, the attempts, and whether delivery succeeded.

## Responding to Deliveries

Return a `2xx` quickly, before doing heavy work. Anything else (including a timeout) triggers the
retry schedule in [overview.md](overview.md). Webhooks can arrive more than once, so deduplicate
on `svix-id` (stable across retries) or on the event's `id`.
