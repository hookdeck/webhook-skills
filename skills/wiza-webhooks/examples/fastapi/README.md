# Wiza Webhooks - FastAPI Example

Minimal example of receiving Wiza webhooks and authenticating them with the `x-auth-key` header.

Wiza does not sign the request body. Every webhook carries an `x-auth-key` header containing the
lowercase hex SHA-256 hash of your Wiza API key. The handler hashes `WIZA_API_KEY` and compares the
result with the whole header value in constant time. The route reads the body with
`await request.body()`, so any content type works, and parses it only after the check.

This is a static shared credential: it authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Use HTTPS, and rotate the API key if it leaks.

## Prerequisites

- Python 3.9+
- A Wiza account with an API key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `WIZA_API_KEY` to your Wiza API key (Settings > API).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/wiza`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send finished and failed `individual_reveal` payloads with correct, wrong and missing
`x-auth-key` values. No Wiza account is needed.

To try it by hand:

```bash
AUTH_KEY=$(printf %s "$WIZA_API_KEY" | sha256sum | cut -d' ' -f1)
curl -X POST http://localhost:8000/webhooks/wiza \
  -H "Content-Type: application/json" \
  -H "x-auth-key: $AUTH_KEY" \
  -d '{"status":{"code":200,"message":"Single reveal finished"},"type":"individual_reveal","data":{"id":12345}}'
```

## Receive Webhooks Locally

Wiza can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 wiza --path /webhooks/wiza
```

Put the printed URL in Wiza as the webhook URL. In Hookdeck, enter the lowercase hex SHA-256 hash of
your Wiza API key, as sent in `x-auth-key`, not the API key itself.

## How It Works

- `main.py`: `verify_wiza_request()` plus the `POST /webhooks/wiza` route

1. `x-auth-key` is checked before the body is parsed. A missing or mismatched value returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `type` (`individual_reveal`) and reads `status.code`
   (`200` finished, `400` failed).
4. It returns `200 {"received": true}`.
