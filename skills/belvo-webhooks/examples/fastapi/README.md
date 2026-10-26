# Belvo Webhooks - FastAPI Example

Minimal example of receiving Belvo Payments (Mexico and Brazil) and Aggregation webhooks and
authenticating them with the `Authorization` header.

Belvo does not sign payloads. The only authentication is an optional static credential you set
on the webhook, sent as the `Authorization` header (`Bearer <token>`, or `Basic <base64>` on
Aggregation webhooks). The handler compares the **whole header value**, scheme prefix included,
with a constant-time comparison. A static credential proves who sent the request, not that the
body is intact, and gives no replay protection, so use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Belvo account with a webhook configured (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BELVO_AUTHORIZATION` to the full header value Belvo sends, e.g. `Bearer 1234-...`.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/belvo`.

## Test

```bash
pytest test_webhook.py
```

The tests send Payments and Aggregation shapes with correct, wrong and missing `Authorization`
headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/belvo \
  -H "Content-Type: application/json" \
  -H "Authorization: $BELVO_AUTHORIZATION" \
  -d '{"eventType":"payment_request_update","eventCode":"payment_request_successful","details":{"id":"3118128a","status":"successful","amount":100.5}}'
```

## Receive Belvo Webhooks Locally

```bash
npx hookdeck-cli listen 8000 belvo --path /webhooks/belvo
```

Use the printed URL as the webhook URL in Belvo.

## How It Works

- `main.py`: `verify_belvo_request()`, the `require_belvo_auth` dependency and the `POST /webhooks/belvo` route

1. The body is read raw with `await request.body()`, so any content type works.
2. The `require_belvo_auth` dependency compares `Authorization` in full with `BELVO_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. Payments Mexico bodies carry `eventCode`; Payments Brazil V2 bodies carry `schema_version` and
   `resource`; Brazil V1 and Aggregation bodies carry `webhook_type` and `webhook_code`, with
   `object_id` (Brazil V1) or `link_id` (Aggregation).
   The handler dispatches on whichever is present.
5. It returns `200 {"received": true}`.
