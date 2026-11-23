# Sohar Health Webhooks - FastAPI Example

Minimal example of receiving Sohar Health webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Sohar Health delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- A Sohar Health account with production API credentials and a webhook endpoint (an account administrator reveals its `whsec_...` signing secret in the dashboard)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Sohar Health webhook secret to `.env` as `SOHAR_HEALTH_WEBHOOK_SECRET` (the full
   `whsec_...` value from the dashboard: Webhooks > your endpoint > **Signing Secret**).

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/sohar-health
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 sohar-health --path /webhooks/sohar-health
```

1. Register the tunnel URL with the [Create Webhook](https://docs.soharhealth.com/api-reference/webhooks/create-webhook.md) API (`POST /v1/webhooks`, production credentials). It returns an `endpointId`.
2. Subscribe it with [Create Event](https://docs.soharhealth.com/api-reference/webhooks/create-webhook-event.md) (`POST /v1/webhooks/{endpointId}/events`, body `{"event": "sandbox.verification.updated"}`).
3. Open the endpoint in the [Webhooks](https://app.soharhealth.com/webhooks) page, reveal the **Signing Secret** in the detail panel, and copy it into `.env`.

## Event Handling

The body is flat JSON with a top-level `event` (`status` is the resource's state, not the event
type). The handler routes on `event` and acknowledges anything else with `200`:

- `verification.updated`, `verification.pending`
- `discovery.updated`
- `flow.updated`, `flow.callback`
- the same five with a `sandbox.` prefix (`sandbox.verification.updated`, ...)

Sohar Health documents no retry schedule or ordering, so deduplicate on `svix-id`.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
