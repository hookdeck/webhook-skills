# Celitech Webhooks - FastAPI Example

Minimal example of receiving Celitech webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Celitech delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Celitech account with webhooks enabled (Celitech enables them per account on request) and an endpoint signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Celitech signing secret to `.env` as `CELITECH_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/celitech
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Celitech uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including a delivery sent with `webhook-*` headers instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 celitech --path /webhooks/celitech
```

1. In Celitech, go to **Developers → Webhooks** and add an endpoint with the tunnel URL.
2. Copy the endpoint's signing secret into `.env`.

## Event Handling

The handler routes these events (the body is flat, with `type` at the top level) and logs anything else:

- `consumption.threshold.reached`
- `esim.downloaded`
- `esim.installed`
- `esim.enabled`
- `esim.disabled`
- `esim.deleted`

The raw body is read with `await request.body()`, so the exact bytes are verified
whatever the content type, and JSON is parsed only after the check passes.

The `svix` library always enforces a 5-minute timestamp window. Hookdeck retries and replays
resend the original timestamp, so late retries are rejected; see the skill's
`references/verification.md` for a manual verifier where the window can be dropped.
