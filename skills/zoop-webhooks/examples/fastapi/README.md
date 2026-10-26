# Zoop Webhooks - FastAPI Example

Minimal example of receiving Zoop webhooks and authenticating them with the `Authorization` header.

Zoop does not sign payloads. You set an `authorization` string when you create the webhook
through the Zoop API, and Zoop sends it back verbatim in the `Authorization` header. The handler
compares the **whole header value** with a constant-time comparison, answers the `ping`
validation event with `200`, acknowledges every event before processing it (Zoop waits 1 second)
and dedupes on the event `id`.

## Prerequisites

- Python 3.9+
- A Zoop marketplace. Create the webhook with an `authorization` value (see
  [../../references/setup.md](../../references/setup.md))

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

3. Set `ZOOP_AUTHORIZATION` to the exact `authorization` string you gave Zoop.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/zoop`.

## Test

```bash
pytest test_webhook.py
```

The tests send the documented `ping` and event bodies with correct, wrong and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/zoop \
  -H "Content-Type: application/json" \
  -H "Authorization: $ZOOP_AUTHORIZATION" \
  -d '{"id":"evt_1","resource":"event","type":"transaction.succeeded","payload":{"object":{"id":"tx_1"}}}'
```

## Receive Zoop Webhooks Locally

```bash
npx hookdeck-cli listen 8000 zoop --path /webhooks/zoop
```

Use the printed URL as the webhook `url` when you create the webhook.

## How It Works

- `main.py`: `verify_zoop_request()`, `process_event()` and the `POST /webhooks/zoop` route

1. The body is read raw (`await request.body()`), so any content type works.
2. `Authorization` is compared with `ZOOP_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object with a string `type` (`400` otherwise).
4. The handler returns `200 {"received": true}` immediately; a background task processes the event.
5. `process_event` dedupes on `id` and dispatches on `type` (`ping`, `transaction.succeeded`,
   `transaction.failed`, `transaction.canceled`, `seller.activated`, `bank_account.associated`).

A static credential authenticates the sender, not the body, and gives no replay protection: use
HTTPS and rotate the value if it leaks.
