# Speechmatics Webhooks - FastAPI Example

Minimal example of receiving Speechmatics batch job notifications, authenticated with the
header you register in the job's `notification_config.auth_headers`.

Speechmatics does not sign notifications, so there is no HMAC signature to verify. The handler
compares the whole header value against your configured secret with a constant-time comparison.
A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp): use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Speechmatics account and API key (see [../../references/setup.md](../../references/setup.md))

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

3. Choose a header and a long random token (`openssl rand -hex 32`). Set
   `SPEECHMATICS_WEBHOOK_HEADER` (default `Authorization`) and `SPEECHMATICS_WEBHOOK_SECRET`
   (the exact whole value, e.g. `Bearer <token>`) in `.env`, and add the same header to the
   job: `"auth_headers": ["Authorization: Bearer <token>"]`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts `POST` and `PUT` at `/webhooks/speechmatics`.

## Test

```bash
pytest test_webhook.py
```

The tests send deliveries with a correct, wrong and missing header, with POST and PUT, and with
JSON, text, multipart and empty bodies. No Speechmatics account is needed.

To try it by hand:

```bash
curl -X POST "http://localhost:8000/webhooks/speechmatics?id=r6sr3jlzjj&status=success" \
  -H "Authorization: Bearer <token>"
```

## Receive Webhooks Locally

Speechmatics can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 speechmatics --path /webhooks/speechmatics
```

Use the printed URL as the `url` in `notification_config`.

## How It Works

- `main.py`: `verify_speechmatics_request()`, a `require_speechmatics_auth` dependency and the `/webhooks/speechmatics` route (POST and PUT)

1. The request is authenticated by the dependency before the body is read: the header named by
   `SPEECHMATICS_WEBHOOK_HEADER` must carry exactly `SPEECHMATICS_WEBHOOK_SECRET`. Failure
   returns `401`.
2. The body is read raw (`await request.body()`). JSON is parsed only for JSON content types
   (`400` if invalid); text, multipart and empty bodies are accepted as they are.
3. The handler dispatches on the `status` query parameter (`success`, `error`, `fetch_error`,
   `trim_error`), with the job ID from `id`.
4. It returns `200 {"received": true}`. Speechmatics retries any non-2xx response.
