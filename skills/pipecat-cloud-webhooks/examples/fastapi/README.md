# Pipecat Cloud Webhooks - FastAPI Example

Minimal example of receiving Pipecat Cloud webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Pipecat Cloud signs deliveries per Standard Webhooks with `svix-*` headers).

## Prerequisites

- Python 3.9+
- Pipecat Cloud organization with a webhook endpoint and its signing secret (`whsec_...`)

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

3. Add your Pipecat Cloud signing secret to `.env` as `PIPECAT_CLOUD_WEBHOOK_SECRET`. You'll find it on
   the endpoint's page under Settings > Webhooks in the Pipecat Cloud dashboard (key icon on the endpoint's row).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/pipecat-cloud
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
npx hookdeck-cli listen 8000 pipecat-cloud --path /webhooks/pipecat-cloud
```

1. Register the tunnel URL as a webhook endpoint in the Pipecat Cloud dashboard.
2. Copy the endpoint's signing secret into `.env`.
3. Use the endpoint's **send test event** action to deliver a sample `build.succeeded`.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `build.started`, `build.succeeded`, `build.failed`, `build.timeout`
- `deployment.created`, `deployment.updated`
- `service.suspended`, `service.resumed`
- `spend.threshold_reached`, `spend.limit_reached`, `spend.limit_cleared`
- `session.started`
- `org.trial_started`, `org.trial_ended`
- `api_key.created`, `api_key.rotated`, `api_key.deleted`
- `secret.created`, `secret.updated`, `secret.deleted`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
