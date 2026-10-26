# VideoAsk Webhooks - FastAPI Example

Minimal example of receiving VideoAsk webhooks and authenticating them with a secret header.

VideoAsk does not sign payloads, so there is no HMAC to verify. You add a header of your choosing
to the webhook (Connect tab **Add a secret**, or the API); the handler compares that header's whole value with your secret
using a constant-time comparison. A static credential authenticates the sender, not the body, and
gives no replay protection, so use HTTPS. The route reads the body with
`await request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A VideoAsk webhook with a secret header, added in the Connect tab (**Add a secret**) or the API `headers` object (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `VIDEOASK_WEBHOOK_HEADER` to the header name you used (default `secret`) and
   `VIDEOASK_WEBHOOK_SECRET` to its exact value.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/videoask`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented event with correct, wrong and missing header values. No VideoAsk
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/videoask \
  -H "Content-Type: application/json" \
  -H "secret: $VIDEOASK_WEBHOOK_SECRET" \
  -d '{"event_id":"abc","event_type":"form_response","contact":{"contact_id":"1","answers":[]}}'
```

## Receive Webhooks Locally

VideoAsk can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 videoask --path /webhooks/videoask
```

Use the printed URL as the webhook `url` when you call the VideoAsk API.

## How It Works

- `main.py`: `verify_videoask_request()` plus the `POST /webhooks/videoask` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event_type` field: `form_response`,
   `form_response_transcribed`, `form_author_message`, `form_contact_message`,
   `form_contact_tagged`, `form_contact_untagged`.
4. It returns `200 {"received": true}`.
