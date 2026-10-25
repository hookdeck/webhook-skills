# Nexthink Webhooks - FastAPI Example

Minimal example of receiving Nexthink outbound-connector webhooks and authenticating them with
the `Authorization` header.

Nexthink does not sign payloads. The credential is the `Authorization` header built from the
**Bearer token** connector credential (`Authorization: Bearer <token>`). The handler compares the
**whole header value**, including the `Bearer ` prefix, with a constant-time comparison. A static
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS and
rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Nexthink instance with Integrations enabled and a Bearer token connector credential
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

3. Set `NEXTHINK_AUTHORIZATION` to the full header value, e.g. `Bearer your-token`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST`, `PUT` and `PATCH`
`/webhooks/nexthink` (the webhook's Method dropdown).

## Test

```bash
pytest test_webhook.py -v
```

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/nexthink \
  -H "Content-Type: application/json" \
  -H "Authorization: $NEXTHINK_AUTHORIZATION" \
  -d '{"event":"alert triggered","monitor":"High CPU (illustrative)"}'
```

## Receive Nexthink Webhooks Locally

```bash
npx hookdeck-cli listen 8000 nexthink --path /webhooks/nexthink
```

Use the printed URL as the connector credential's URL. Hookdeck's Nexthink source pre-selects
POST without managing the method: allow PUT or PATCH on the source if your webhook uses them.

## How It Works

- `main.py`: `verify_nexthink_request()`, the `require_nexthink_auth` dependency and the route

1. The dependency compares `Authorization` with `NEXTHINK_AUTHORIZATION` before the body is
   read. Failure returns `401`.
2. The raw body is read, so any content type works. An empty body is fine; a non-empty body must
   be valid JSON (`400` otherwise).
3. Nexthink adds no event field. The example dispatches on `event` from an illustrative payload
   template (`alert triggered`, `alert recovered`) that you write yourself.
4. It returns `200 {"received": true}`.
