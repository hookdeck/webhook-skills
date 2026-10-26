# Setting Up Axilio Webhooks

## Prerequisites

- An Axilio organization with access to the dashboard
- Your application's public `https://` webhook endpoint URL (use the Hookdeck CLI to get one for local development)

## How Do I Register a Webhook Destination?

1. Open **Settings > Webhooks** in the Axilio dashboard.
2. Click **Register Destination** and enter your public `https://` URL, for example `https://example.com/webhooks/axilio`.
3. Choose the event types to receive, or subscribe to all of them. Event types are grouped by area: runs, sessions, billing, files and phones. Subscribe narrowly: an endpoint that only handles `run.failed` should not receive `session.started`.
4. **Copy the signing secret.** It starts with `whsec_` and is shown once.

## How Do I Get and Store the Signing Secret?

The secret is per destination. Put the whole value, including `whsec_`, in your environment:

```bash
AXILIO_WEBHOOK_SECRET=whsec_...
```

The Standard Webhooks library strips the prefix and base64-decodes the key itself. Keep it in a secret manager, not in source control.

If you lose it, register the destination again, or rotate it with the API (`POST /webhooks/endpoints/{endpoint_id}:rotateSecret`). A rotation returns the new secret once. By default (`graceful` mode) the previous secret keeps verifying for 24 hours so you can roll out the new one across a deploy; `immediate` mode stops the old secret at once, for a secret that may be compromised.

## How Do I Send a Test Event?

On a destination's page, click **Test** and pick an event type. Axilio delivers that type's example payload to that destination only, with `"test": true`. Every event type can be tested this way before the real event fires. The API can do the same: `POST` a test event with an `event_type` (default `webhook.test`) and an optional `endpoint_id`.

No challenge or handshake is documented. Your endpoint just needs to verify the signature and return a `2xx`.

## How Do I Receive Webhooks Locally?

```bash
npx hookdeck-cli listen 3000 axilio --path /webhooks/axilio
```

Use port `8000` for FastAPI. No install or account required. Register the printed `https://` URL as the destination, then click **Test**.

## How Do I Replay a Failed Delivery?

The dashboard's delivery log shows every attempt and its response. Replay a failed event once your endpoint is fixed. The API also exposes the delivery log, per-event attempts and a replay call.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AXILIO_WEBHOOK_SECRET` | The destination's full `whsec_...` signing secret. Handlers fail closed (`500`) when it is unset |

## Test Mode vs Live Mode

Axilio's webhook docs describe no separate test mode. A **Test** delivery is a signed request to your real destination that carries `"test": true`, so check that flag before triggering real side effects.
