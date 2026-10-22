# OneSpan Webhooks - FastAPI Example

Minimal example of receiving OneSpan Sign callback notifications and authenticating them with
the callback key sent in the `Authorization` header.

OneSpan Sign does not sign payloads. The callback key you registered is sent as
`Authorization: Basic <callback key>`: the raw key, **not** base64(user:pass), so it is not
decoded as HTTP Basic. The handler compares the **whole header value**, including the `Basic `
prefix, with a constant-time comparison. A static credential authenticates the sender, not the
body, and gives no replay protection, so use HTTPS and rotate the key if it leaks.

## Prerequisites

- Python 3.9+
- A OneSpan Sign account with a callback key registered (see
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

3. Set `ONESPAN_AUTHORIZATION` to the full header value, e.g. `Basic myCallbackKey`
   (`Basic ` followed by the callback key you registered).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/onespan`.

## Test

```bash
pytest test_webhook.py
```

The tests send documented callback payloads with correct, wrong, base64-encoded and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/onespan \
  -H "Content-Type: application/json" \
  -H "Authorization: $ONESPAN_AUTHORIZATION" \
  -d '{"name":"PACKAGE_COMPLETE","sessionUser":"e00696ec-d6f5-4feb-89c5-a5ce002a6c66","packageId":"5n4obeO8jYoPp126Cm-Y3fxdfbo="}'
```

## Receive OneSpan Webhooks Locally

```bash
npx hookdeck-cli listen 8000 onespan --path /webhooks/onespan
```

Use the printed URL as the callback URL in OneSpan Sign.

## How It Works

- `main.py`: `verify_onespan_request()`, the `require_onespan_auth` dependency and the `POST /webhooks/onespan` route

1. The `require_onespan_auth` dependency compares `Authorization` in full with
   `ONESPAN_AUTHORIZATION` before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. The event type is the payload's `name` (`PACKAGE_COMPLETE`, `DOCUMENT_SIGNED`, `SIGNER_COMPLETE`, ...).
4. It returns `200 {"received": true}`.
