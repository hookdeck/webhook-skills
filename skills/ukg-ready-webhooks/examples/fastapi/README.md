# UKG Ready Webhooks - FastAPI Example

Minimal example of receiving UKG Ready webhook subscriptions and authenticating them with the
`Authorization` header. For **UKG Ready** (formerly Kronos Workforce Ready) only, not UKG Pro.

UKG Ready does not sign payloads. With Bearer Token authentication it is expected to send
`Authorization: Bearer <token>` (if deliveries are rejected, capture one and set the expected
value exactly as received). The handler compares the **whole header value**, including the
`Bearer ` prefix, in constant time. A static credential authenticates the sender, not the body,
and gives no replay protection, so use HTTPS and rotate the token if it leaks.

## Prerequisites

- Python 3.9+
- A UKG Ready account with access to Global Setup > Webhook Subscriptions
  (see [../../references/setup.md](../../references/setup.md))

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

3. Set `UKG_READY_AUTHORIZATION` to the full header value, e.g. `Bearer <token>`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/ukg-ready`.

## Test

```bash
pytest test_webhook.py
```

The tests send an illustrative payload (UKG Ready shows the real shape only in its app) with
correct, wrong, Basic and missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/ukg-ready \
  -H "Content-Type: application/json" \
  -H "Authorization: $UKG_READY_AUTHORIZATION" \
  -d '{"accountId":1001,"email":"ada@example.com"}'
```

## Receive UKG Ready Webhooks Locally

```bash
npx hookdeck-cli listen 8000 ukg-ready --path /webhooks/ukg-ready
```

Use the printed URL as the Endpoint URL of the subscription. Note that **Test Connection** in
UKG Ready only checks reachability and sends no payload.

## How It Works

- `main.py`: `verify_ukg_ready_request()`, the `require_ukg_ready_auth` dependency and the `POST /webhooks/ukg-ready` route

1. The dependency compares `Authorization` in full with `UKG_READY_AUTHORIZATION` (`hmac.compare_digest` on bytes) before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. It logs the field names and returns `200 {"received": true}`.
