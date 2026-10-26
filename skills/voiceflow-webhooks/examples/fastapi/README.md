# Voiceflow Webhooks - FastAPI Example

Minimal example of receiving Voiceflow webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Voiceflow organization events are delivered through Svix).

## Prerequisites

- Python 3.9+
- Voiceflow organization with a webhook URL set and its signing secret (`whsec_...`)

> **Only organization event webhooks are supported.** The project-level session webhook doesn't
> document this signing scheme and may fail verification here.

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

3. Add your Voiceflow signing secret to `.env` as `VOICEFLOW_WEBHOOK_SECRET`. You'll find it on
   Settings > Organization in the Voiceflow dashboard, next to the webhook URL.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/voiceflow
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
npx hookdeck-cli listen 8000 voiceflow --path /webhooks/voiceflow
```

1. Set the tunnel URL under Settings > Organization in the Voiceflow dashboard.
2. Copy the organization webhook secret into `.env`.
3. Create a project to trigger `organization.project.created`.

## Event Handling

The handler reads the event name from the body's top-level `type` field (details are under
`data`), routes these events, and acknowledges anything else with `200`:

- `organization.project.created`, `organization.project.deleted`
- `organization.project.environment.created`, `organization.project.environment.published`
- `organization.project.environment.merged`, `organization.project.environment.deleted`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
