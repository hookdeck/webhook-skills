# Paxos Webhooks - FastAPI Example

Minimal example of receiving Paxos webhooks and authenticating them with the API Key header you configure in Dashboard.

Paxos does not sign payloads, so there is no HMAC to verify. A FastAPI dependency compares the configured header (`PAXOS_WEBHOOK_HEADER`, default `Authorization`) with `PAXOS_WEBHOOK_SECRET` (the whole value) using `hmac.compare_digest` on bytes. A static credential authenticates the sender, not the body, and offers no replay protection: use HTTPS and rotate it if it leaks. The body is read raw, so any content type works.

## Prerequisites

- Python 3.9+
- A Paxos webhook with Auth Type: API Key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAXOS_WEBHOOK_HEADER` and `PAXOS_WEBHOOK_SECRET` to the API Key Header name and value from Dashboard.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/paxos`.

## Test

```bash
pytest test_webhook.py
```

The tests send documented event types with correct, wrong and missing credentials. No Paxos account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/paxos \
  -H "Content-Type: application/json" \
  -H "$PAXOS_WEBHOOK_HEADER: $PAXOS_WEBHOOK_SECRET" \
  -d '{"id":"bd019f1c-89a7-4372-9d21-eaad9280dc41","type":"identity.approved","source":"com.paxos","time":"2025-01-01T14:30:02Z","object":"event","is_test":false}'
```

## Receive Webhooks Locally

Paxos can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 paxos --path /webhooks/paxos
```

Put the printed URL in the Paxos webhook settings.

## How It Works

- `main.py`: `verify_paxos_request()`, the `require_paxos_credential` dependency and the `POST /webhooks/paxos` route

1. The dependency checks the configured header before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with a string `type` (`400` otherwise).
3. Events with `is_test: true` are acknowledged and ignored.
4. The handler dispatches on `type`: `identity.*`, `transfer.<method>.<status>` and `orchestration.<status>`. Events are thin, so fetch the full object with Get Event using `id`, and dedupe on `id`.
5. It returns `200 {"received": true}`.
