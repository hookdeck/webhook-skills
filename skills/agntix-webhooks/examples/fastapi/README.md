# Agntix Webhooks - FastAPI Example

Minimal example of receiving Agntix webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Agntix signs deliveries per Standard Webhooks with `svix-*` headers; Agntix delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Agntix account with a webhook endpoint (Developer > + Add Endpoint) and its signing secret (`whsec_...`)

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

3. Add your Agntix signing secret to `.env` as `AGNTIX_WEBHOOK_SECRET`. You'll find it on the
   endpoint in the dashboard's **Developer** section.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/agntix
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 agntix --path /webhooks/agntix
```

1. In **Developer > + Add Endpoint**, add the tunnel URL and subscribe to `session.created` and `session.ended`.
2. Copy the endpoint's signing secret into `.env`.
3. Start a test call or chat session so Agntix delivers a real event.

## Event Handling

The handler reads the event name from the body's top-level `eventType` field (the top-level
`type` is the session kind, `VOICE` or `CHAT`), and acknowledges anything else with `200`:

- `session.created`
- `session.ended` (with the post-call `analysis` and `recordingUrl`)

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
