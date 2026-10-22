# Coterie Webhooks - FastAPI Example

Minimal example of receiving Coterie application, quote and policy webhooks and
authenticating them with the `Authentication` header.

Coterie does not sign payloads. The only authentication is an opt-in static header named
`Authentication` (not `Authorization`) that Coterie sends as `Authentication: token <guid>`.
The handler compares the **whole header value**, including the `token ` prefix, with a
constant-time comparison.

## Prerequisites

- Python 3.9+
- A Coterie partner account. Ask your Coterie contact to enable the `Authentication` header
  and webhooks (see [../../references/setup.md](../../references/setup.md))

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

3. Set `COTERIE_AUTHENTICATION` to the full header value, e.g. `token 1234-...`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/coterie`.

## Test

```bash
pytest test_webhook.py
```

The tests send the documented application, quote and policy shapes with correct, wrong and
missing `Authentication` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/coterie \
  -H "Content-Type: application/json" \
  -H "Authentication: $COTERIE_AUTHENTICATION" \
  -d '{"applicationId":"83857350-4bfb-4669-862c-61f05a7a4be9","Status":"ReadyToQuote"}'
```

## Receive Coterie Webhooks Locally

```bash
npx hookdeck-cli listen 8000 coterie --path /webhooks/coterie
```

Give the printed URL to your Coterie contact as the webhook URL.

## How It Works

- `main.py`: `verify_coterie_request()`, the `require_coterie_auth` dependency and the `POST /webhooks/coterie` route

1. The `require_coterie_auth` dependency compares `Authentication` with
   `COTERIE_AUTHENTICATION` before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. Coterie payloads have no event-type field, so the handler classifies them by identifier:
   `quoteId` (quote), `PolicyId` (policy), `applicationId` (application).
4. It returns `200 {"received": true}`.
