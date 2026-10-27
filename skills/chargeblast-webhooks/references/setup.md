# Setting Up Chargeblast Webhooks

## Prerequisites

- A Chargeblast account
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Chargeblast Webhook URL?

Chargeblast's documentation says to set up your webhook URL in the Chargeblast dashboard's **settings** tab.

1. Open the settings tab in the Chargeblast dashboard.
2. Enter your endpoint URL, e.g. `https://example.com/webhooks/chargeblast`.
3. Save. Chargeblast then begins emitting events to that URL.

No per-event-type selection, challenge request or validation request is documented, so every event type arrives at the one URL. Branch on the `X-Event-Type` header.

## Where Do I Find the Webhook Secret?

The webhook secret is shown in the dashboard's settings tab as `whsec_xxxxxxxxxxxx`. Store the full value, prefix included:

```bash
CHARGEBLAST_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

The signing key is the base64-decoded part after `whsec_`. If the value doesn't start with `whsec_`, the examples answer 500 rather than verify with the wrong key.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 chargeblast --path /webhooks/chargeblast   # use 8000 for FastAPI
```

Use the printed URL as the webhook URL. Per Chargeblast's event notes, `alert.created` is also emitted by manual replay or test sends from their tooling, so ask Chargeblast how to trigger one for your account if no real alert is due.
