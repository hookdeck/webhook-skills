# Egnyte Webhooks - FastAPI Example

Minimal example of receiving Egnyte webhooks and authenticating them with the `Authorization`
header.

Egnyte does not sign payloads. It sends the `authHeader` you set when registering the webhook
as the `Authorization` header. The handler compares the **whole header value**, including any
`Bearer ` prefix, with `hmac.compare_digest` on bytes. A static credential authenticates the
sender, not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

## Prerequisites

- Python 3.9+
- An Egnyte domain and a webhook registered with an `authHeader` (see
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

3. Set `EGNYTE_AUTHORIZATION` to the full `authHeader` value, e.g. `Bearer secret-token-12345`.
   Paste the authHeader value exactly as set on the Egnyte webhook, including any "Bearer " prefix.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/egnyte`.

## Test

```bash
pytest test_webhook.py
```

The tests send Egnyte's documented `{"data": [...]}` shape with correct, wrong and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/egnyte \
  -H "Content-Type: application/json" \
  -H "Authorization: $EGNYTE_AUTHORIZATION" \
  -d '{"data":[{"eventId":"evt-1","eventType":"fs:add_file","data":{"targetPath":"/Shared/a.txt"}}]}'
```

## Receive Egnyte Webhooks Locally

```bash
npx hookdeck-cli listen 8000 egnyte --path /webhooks/egnyte
```

Register the printed URL as the webhook `url`.

## How It Works

- `main.py`: `verify_egnyte_request()`, the `require_egnyte_auth` dependency and the `POST /webhooks/egnyte` route

1. The `require_egnyte_auth` dependency compares `Authorization` with `EGNYTE_AUTHORIZATION`
   before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON, so any content type works. It must be `{"data": [...]}`
   (`400` otherwise).
3. The handler loops over `data[]` and dispatches on `eventType`.
4. It returns exactly `200 {"received": true}`; Egnyte retries on any other status and
   eventually disables the webhook.
