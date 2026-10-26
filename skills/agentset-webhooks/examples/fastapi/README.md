# Agentset Webhooks - FastAPI Example

Minimal example of receiving Agentset webhooks with signature verification.

Agentset sends `agentset-signature`: the bare hex HMAC-SHA256 of the raw request body, keyed with the
webhook's signing secret. Nothing else is signed, so there is no timestamp to check. A dependency reads
the raw bytes with `await request.body()`, verifies in constant time (`hmac.compare_digest` on bytes),
and only then is the JSON parsed. The route accepts GET, POST, PUT, PATCH and DELETE, because
Agentset's docs don't name the method.

## Prerequisites

- Python 3.9+
- An Agentset webhook and its signing secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AGENTSET_WEBHOOK_SECRET` to the secret from the webhook's **Update Details** tab.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and serves `/webhooks/agentset`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads based on Agentset's documented examples with real HMAC-SHA256 and cover valid,
missing, malformed, wrong and tampered signatures, every method, empty bodies, any content type and
wrong-typed fields. No Agentset account is needed.

## Receive Webhooks Locally

Agentset can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 agentset --path /webhooks/agentset
```

Use the printed URL as the webhook URL. Hookdeck's Agentset source pre-selects POST without managing
the method, so allow any other method Agentset uses on the source.

## How It Works

- `main.py`: `verify_agentset_signature()`, the `verified_body` dependency and the route (`api_route`)

1. The signature is checked over the raw body bytes (zero bytes if there is no body). Failure returns `401`.
2. A verified empty body is acknowledged with `200`.
3. Otherwise the body must be a JSON object (`400` if not).
4. The handler dispatches on the top-level `event`: `document.ready`, `document.error`,
   `document.deleted`, `ingest_job.ready`, `ingest_job.error`. Other events are logged.
5. It returns `200 {"received": true}`.
