# Recall.ai Webhooks - FastAPI Example

Minimal example of receiving Recall.ai webhooks with Standard Webhooks signature verification. It accepts both the `webhook-*` headers (workspace verification secret) and the legacy `svix-*` headers (Svix endpoint secret on accounts created before 2025-12-15).

## Prerequisites

- Python 3.10+
- A Recall.ai workspace verification secret (`whsec_...`), or a legacy Svix endpoint signing secret (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `RECALL_WEBHOOK_SECRET` in `.env` to the full `whsec_...` value.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

### Run unit tests

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the real algorithm (base64 HMAC-SHA256 over `<id>.<timestamp>.<raw body>`) and cover both header prefixes, multiple signatures during secret rotation, wrong secrets, tampered and re-serialised bodies, stale timestamps, and the handled event types.

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 8000 recall-ai --path /webhooks/recall-ai
```

Add the printed URL as an endpoint in your region's Recall.ai webhooks dashboard (Svix webhooks: bot, recording, transcript, calendar events), or pass it as a `realtime_endpoints` URL when creating a bot (real-time events). Svix webhooks only reach the endpoint for events it is subscribed to, so subscribe to the events you want first.

## Endpoint

- `POST /webhooks/recall-ai` — verifies the signature (400 on failure) and routes on the body's `event` field.
- `GET /health` — liveness probe.
