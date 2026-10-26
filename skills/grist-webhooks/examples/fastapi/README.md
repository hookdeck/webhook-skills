# Grist Webhooks - FastAPI Example

Minimal example of receiving Grist row webhooks and authenticating them with the
`Authorization` header.

Grist does not sign payloads. The credential is the webhook's **Header Authorization** field,
a static string Grist sends verbatim as the `Authorization` header. The handler compares the
**whole header value**, including any `Bearer ` or `Basic ` prefix, with a constant-time
comparison. A static credential authenticates the sender, not the body, and gives no replay
protection, so use HTTPS and rotate it if it leaks.

## Prerequisites

- Python 3.9+
- A Grist document with a webhook (see [../../references/setup.md](../../references/setup.md))

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

3. Set `GRIST_AUTHORIZATION` to the Header Authorization value exactly as set in Grist,
   including any "Bearer " or "Basic " prefix.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/grist`.

## Test

```bash
pytest test_webhook.py
```

The tests send a documented row array with correct, wrong and missing `Authorization`
headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/grist \
  -H "Content-Type: application/json" \
  -H "Authorization: $GRIST_AUTHORIZATION" \
  -d '[{"id":29,"manualSort":29,"Title":"Trophy","Price":60}]'
```

## Receive Grist Webhooks Locally

```bash
npx hookdeck-cli listen 8000 grist --path /webhooks/grist
```

Use the printed URL as the webhook **URL** in Grist (Document settings > Webhooks).

## How It Works

- `main.py`: `verify_grist_request()`, the `require_grist_auth` dependency and the `POST /webhooks/grist` route

1. The `require_grist_auth` dependency compares `Authorization` with `GRIST_AUTHORIZATION`
   before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON, so any content type works.
3. The body must be a JSON array of row objects (`400` otherwise).
4. Grist payloads have no event field (the `add` / `update` event types are set in the
   webhook config), so every row is handled as an upsert keyed on `id`.
5. It returns `200 {"received": true, "rows": <count>}`.
