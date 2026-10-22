# RudderStack Webhooks - FastAPI Example

Minimal example of receiving RudderStack HTTP Webhook destination calls and authenticating
them with HTTP Basic auth.

RudderStack does not sign payloads. The destination sends the Basic Auth credentials you
configure as `Authorization: Basic base64(username:password)`. The handler compares the
username and the password each in constant time, evaluating both before deciding. A static
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS
and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A RudderStack HTTP Webhook destination with **Authentication: Basic Auth**
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `RUDDERSTACK_WEBHOOK_USERNAME` and `RUDDERSTACK_WEBHOOK_PASSWORD` to the Basic Auth
   username and password configured on the destination.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts webhooks at `/webhooks/rudderstack` for `POST`, `PUT`,
`PATCH`, `GET` and `DELETE` (the method is chosen in the destination settings).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover correct, wrong, swapped, missing and malformed credentials, every method, a
batched array body, and an empty `GET` body. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/rudderstack \
  -u "$RUDDERSTACK_WEBHOOK_USERNAME:$RUDDERSTACK_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"type":"track","event":"Order Completed","userId":"u1"}'
```

## Receive RudderStack Webhooks Locally

```bash
npx hookdeck-cli listen 8000 rudderstack --path /webhooks/rudderstack
```

Use the printed URL as the destination's **Base URL**.

## How It Works

- `main.py`: `verify_rudderstack_request()`, a `require_rudderstack_auth` dependency and the `/webhooks/rudderstack` route (`api_route`)

1. The body is read with `await request.body()`, so any content type works.
2. The `Authorization` header must be `Basic` (case-insensitive) with base64 `username:password`,
   split on the first colon. Missing, malformed or mismatched credentials return `401`.
3. An empty body is accepted. Otherwise the body must be a JSON object or an array of objects
   (batching), else `400`.
4. Each event is dispatched on `type`: `track`, `identify`, `page`, `screen`, `group`, `alias`.
5. It returns `200 {"received": true, "events": <count>}`.
