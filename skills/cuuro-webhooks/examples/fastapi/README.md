# Cuuro Webhooks - FastAPI Example

Minimal example of receiving Cuuro webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Cuuro delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Cuuro account with an API integration, a webhook configured on it, and its webhook secret (`whsec_...`)

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

3. Add your Cuuro webhook secret to `.env` as `CUURO_WEBHOOK_SECRET`
   (the full `whsec_...` signing secret for your webhook; Cuuro's docs don't say where it is shown, see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/cuuro
```

## Test

```bash
pytest test_webhook.py
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), and check that the `webhook-*` header names are
accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 cuuro --path /webhooks/cuuro
```

1. Set the tunnel URL as the webhook URL in Cuuro under Settings > Developers > your API integration > Webhooks.
2. Copy the webhook secret into `.env`.
3. Trigger an event, for example by creating a target company (`startup.created`) or an analysis through the Cuuro API.

## Event Handling

The body is `{ "data": { "id": ... }, "event": ... }`. The handler reads the event name from the top-level
`event` field (`data.id` is the company or analysis id), routes these events, and logs anything else:

- `startup.created`
- `analysis.created`
- `analysis.completed`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
