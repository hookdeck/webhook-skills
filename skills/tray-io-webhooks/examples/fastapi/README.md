# Tray.io Webhooks - FastAPI Example

Minimal example of receiving requests from a Tray.io (tray.ai) workflow and authenticating them
with a secret header.

Tray requests are unsigned. The workflow's HTTP Client step adds a header you choose, and the
handler compares its whole value with `TRAY_IO_WEBHOOK_SECRET` using a constant-time comparison.
A static credential authenticates the sender, not the body, and gives no replay protection, so use
HTTPS and rotate the credential if it leaks. The route accepts `POST`, `PUT`, `PATCH`, `DELETE` and
`GET`, accepts an empty body, and reads the body with `await request.body()` so any content type works.

## Prerequisites

- Python 3.9+
- A Tray.io workflow with an HTTP Client step (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TRAY_IO_WEBHOOK_HEADER` to the header name you add in the HTTP Client step, and
   `TRAY_IO_WEBHOOK_SECRET` to the exact whole header value (including any `Bearer ` prefix).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/tray-io`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover correct, wrong and missing credentials, every method, empty bodies and the
illustrative events. No Tray account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/tray-io \
  -H "Content-Type: application/json" \
  -H "Authorization: $TRAY_IO_WEBHOOK_SECRET" \
  -d '{"event":"record.created","data":{"id":"rec_123"}}'
```

(Use the header name from `TRAY_IO_WEBHOOK_HEADER` if you changed it.)

## Receive Webhooks Locally

Tray can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 tray-io --path /webhooks/tray-io
```

Use the printed URL as the HTTP Client step's URL.

## How It Works

- `main.py`: `verify_tray_request()`, a `require_tray_credential` dependency and the `/webhooks/tray-io` route

1. The credential header is checked before the body is parsed. Failure returns `401`.
2. An empty body returns `200`; a non-empty body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event` field. Tray defines no event types, so
   `record.created`, `record.updated` and `record.deleted` are illustrative.
4. It returns `200 {"received": true}`.
