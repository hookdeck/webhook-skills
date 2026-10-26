# Navattic Webhooks - FastAPI Example

Minimal example of receiving Navattic `session_closed` webhooks and authenticating them with
the `Authorization` header.

Navattic does not sign payloads. The only authentication is an `Authorization` header
(`Basic <credentials>` or `Bearer <token>`) that Navattic sends only when you configure it on
the webhook. The handler compares the **whole header value**, including the scheme prefix, with a
constant-time comparison. A static credential authenticates the sender, not the body, and gives no
replay protection: use HTTPS and rotate it if it leaks.

## Prerequisites

- Python 3.9+
- A Navattic webhook with an `Authorization` credential configured (see [../../references/setup.md](../../references/setup.md))

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

3. Set `NAVATTIC_AUTHORIZATION` to the full header value, e.g. `Bearer your-token`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The route `/webhooks/navattic` accepts `GET`, `POST`, `PUT`,
`PATCH` and `DELETE`, because Navattic's docs don't name the method. Hookdeck's Navattic source
pre-selects `POST` without managing the method, so allow any other method on the source too.

## Test

```bash
pytest test_webhook.py
```

The tests send the documented visitor and account `session_closed` shapes with correct, wrong and
missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/navattic \
  -H "Content-Type: application/json" \
  -H "Authorization: $NAVATTIC_AUTHORIZATION" \
  -d '{"eventType":"session_closed","timestamp":"2026-07-14T18:32:05.000Z","data":{"session":{"mostRecentDemoName":"Acme Product Tour"}}}'
```

## Receive Navattic Webhooks Locally

```bash
npx hookdeck-cli listen 8000 navattic --path /webhooks/navattic
```

Use the printed URL as the webhook URL in Navattic.

## How It Works

- `main.py`: `verify_navattic_request()`, the `require_navattic_auth` dependency and the `api_route` for each method

1. The body is read raw with `await request.body()`, so any content type works.
2. The `require_navattic_auth` dependency compares `Authorization` with `NAVATTIC_AUTHORIZATION` before the body is read. Failure returns `401`.
3. An empty body returns `200` (nothing to process); invalid JSON or a non-object returns `400`.
4. The handler dispatches on `eventType` (`session_closed`) and tells visitor events (`data.session`)
   from account events (`data` is the company account) apart.
5. It returns `200 {"received": true}`.
