# Lokalise Webhooks - FastAPI Example

Minimal example of receiving Lokalise webhooks with FastAPI and authenticating them with
the webhook secret Lokalise sends in the `X-Secret` header.

Lokalise does not sign payloads, so there is no HMAC to verify. The handler compares the
header against your configured secret with a constant-time comparison.

## Prerequisites

- Python 3.9+
- A Lokalise project with the Webhooks app installed (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LOKALISE_WEBHOOK_SECRET` to the secret shown in Lokalise (Apps > Webhooks). If you
   configured `X-Api-Key` or a custom header instead of `X-Secret`, set
   `LOKALISE_WEBHOOK_HEADER` to that header name.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/lokalise`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send requests with a correct, wrong, differently sized and missing secret, and
check the event dispatch and the setup ping. No Lokalise account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/lokalise \
  -H "Content-Type: application/json" \
  -H "X-Secret: $LOKALISE_WEBHOOK_SECRET" \
  -d '{"event":"project.keys.added","keys":[{"id":1,"name":"test.title"}]}'
```

## Receive Lokalise Webhooks Locally

Lokalise can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 lokalise --path /webhooks/lokalise
```

Put the printed URL in the Webhooks app's **URL** field.

## How It Works

- `main.py`: `verify_lokalise_request()`, the `require_lokalise_secret` dependency and the route

1. The dependency checks `X-Secret` (or the header named in `LOKALISE_WEBHOOK_HEADER`)
   against `LOKALISE_WEBHOOK_SECRET` in constant time before the body is parsed. Failure
   returns `401`.
2. The raw body is parsed as JSON and dispatched on its `event` field
   (`project.translation.updated`, `project.keys.added`, `project.task.closed`, ...).
3. Lokalise's setup ping (and any body that isn't an event) is acknowledged with `200`.
4. Lokalise expects a 2xx within 8 seconds, otherwise it retries for up to 24 hours.
