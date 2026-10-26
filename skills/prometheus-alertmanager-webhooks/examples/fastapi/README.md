# Prometheus Alertmanager Webhooks - FastAPI Example

Minimal example of receiving Prometheus Alertmanager webhooks and authenticating them with the
`Authorization: Bearer` header.

Alertmanager does not sign payloads, so there is no HMAC to verify. The receiver's `http_config`
sends `Authorization: Bearer <credentials>` on every request, and the handler compares those
credentials with your stored secret in constant time. The route reads the body with
`await request.body()`, so any content type works, and parses it only after the check.

A static credential authenticates the sender, not the body, and gives no replay protection. Use
HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Prometheus Alertmanager with a webhook receiver (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ALERTMANAGER_WEBHOOK_SECRET` to the bare secret you configure as the receiver's
   `authorization.credentials` (no `Bearer ` prefix).

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/prometheus-alertmanager`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send firing and resolved notifications with correct, wrong, missing and mis-schemed
credentials. No Alertmanager is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/prometheus-alertmanager \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALERTMANAGER_WEBHOOK_SECRET" \
  -d '{"version":"4","groupKey":"{}:{alertname=\"HighCPU\"}","status":"firing","receiver":"hookdeck","alerts":[{"status":"firing","labels":{"alertname":"HighCPU"},"annotations":{},"startsAt":"2026-10-26T10:00:00Z","endsAt":"0001-01-01T00:00:00Z","fingerprint":"1a2b3c4d5e6f7a8b"}]}'
```

## Receive Webhooks Locally

Alertmanager can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 prometheus-alertmanager --path /webhooks/prometheus-alertmanager
```

Put the printed URL in the receiver's `url`.

## How It Works

- `main.py`: `verifyAlertmanagerRequest()` plus the `POST /webhooks/prometheus-alertmanager` route

1. The `Authorization` header must start with `Bearer ` (any case); the rest is compared with the
   secret in constant time. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. `status` (`firing` or `resolved`) is a state, not an event type. The handler loops over
   `alerts[]` and dispatches on each alert's own `status`.
4. Repeat notifications are skipped using `groupKey` plus each alert's `fingerprint`, `status`,
   `startsAt` and `endsAt` (in-memory here; use a shared store in production).
5. It returns `200 {"received": true}`.
