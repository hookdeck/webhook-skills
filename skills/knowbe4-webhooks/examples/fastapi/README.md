# KnowBe4 Webhooks - FastAPI Example

Minimal example of receiving KnowBe4 (KSAT and PhishER) webhooks and authenticating them with a
secret custom header.

KnowBe4 does not sign webhooks, so there is no HMAC to verify. Add a custom header with a secret
value to the KSAT or PhishER webhook, and a FastAPI dependency compares that header with
`KNOWBE4_WEBHOOK_SECRET` in constant time (`hmac.compare_digest` on bytes) before the body is
parsed. The route reads the raw body, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A KSAT (Platinum, Diamond or SAT Advanced) or PhishER account (see [../../references/setup.md](../../references/setup.md))

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

3. Set `KNOWBE4_WEBHOOK_HEADER` to the name of the custom header you added (default `Authorization`)
   and `KNOWBE4_WEBHOOK_SECRET` to its exact, whole value (including any `Bearer ` prefix).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/knowbe4`.

## Test

```bash
pytest test_webhook.py
```

No KnowBe4 account is needed. To try it by hand (the body is an illustrative payload):

```bash
curl -X POST http://localhost:8000/webhooks/knowbe4 \
  -H "Content-Type: application/json" \
  -H "Authorization: $KNOWBE4_WEBHOOK_SECRET" \
  -d '{"event_type":"Phish Failure Removed","System":"KnowBe4"}'
```

## Receive Webhooks Locally

KnowBe4 can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 knowbe4 --path /webhooks/knowbe4
```

Put the printed URL in the KSAT or PhishER webhook.

## How It Works

- `main.py`: `verify_knowbe4_request()`, the `require_knowbe4_auth` dependency and the route

Failure returns `401`; a body that isn't a JSON object returns `400`; success returns
`200 {"received": true}`. The handler reads an illustrative `event_type` string, because KnowBe4
documents no event field.
