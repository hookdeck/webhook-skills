# MeasureOne Webhooks - FastAPI Example

Minimal example of receiving MeasureOne webhooks and authenticating them with a static header.

MeasureOne does not sign payloads, so there is no HMAC to verify. You add a secret header to
`delivery_details[].headers` on each Data Request; the handler compares that header (name from
`MEASUREONE_WEBHOOK_HEADER`, default `Authorization`) with `MEASUREONE_WEBHOOK_SECRET`, the exact
whole value, in constant time. The route reads the body with `await request.body()`, so any content type works.

Add a static header to delivery_details.headers on the Data Request and enter it here. The JWT option fetches a new token for every delivery and cannot be checked.

This authenticates the sender only: it does not protect the body and gives no replay protection.
Use HTTPS and rotate the credential if it leaks. The JWT option cannot be checked, and Basic is not
covered by Hookdeck's MeasureOne source.

## Prerequisites

- Python 3.9+
- A MeasureOne account (see [../../references/setup.md](../../references/setup.md))

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

3. Set `MEASUREONE_WEBHOOK_HEADER` and `MEASUREONE_WEBHOOK_SECRET` to the header name and exact whole
   value you put in `delivery_details[].headers`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/measureone`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented event with correct, wrong and missing header values. No MeasureOne
account is needed.

To try it by hand (use your header name and value):

```bash
curl -X POST http://localhost:8000/webhooks/measureone \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-shared-secret" \
  -d '{"event":"datarequest.items_available","datarequest_id":"dr_01","individual_id":"ind_01"}'
```

## Receive Webhooks Locally

MeasureOne can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 measureone --path /webhooks/measureone
```

Use the printed URL as the `url` in `delivery_details`.
