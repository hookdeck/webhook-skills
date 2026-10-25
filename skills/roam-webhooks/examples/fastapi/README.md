# Roam Webhooks - FastAPI Example

Minimal example of receiving Roam (ro.am) webhooks with Standard Webhooks signature verification, using the ``standardwebhooks` library.

Roam signs deliveries with `webhook-id`, `webhook-timestamp` and `webhook-signature` headers: base64 HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the base64-decoded part of the `whsec_` secret. The library checks the signature against the **raw body** and rejects timestamps more than 5 minutes off. Hookdeck retries and replays resend the original timestamp, so behind Hookdeck use the manual verifier in `references/verification.md` where the window can be dropped.

## Prerequisites

- Python 3.9+
- A Roam API Key or OAuth App with a webhook and its signing secret (`whsec_...`)

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret to `.env` as `ROAM_WEBHOOK_SIGNING_SECRET` (Roam Administration → Developer → your app → Webhooks tab). Configure a signing secret: without one, deliveries are unsigned and fail verification.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/roam`.

## Test

Run the test suite (signs payloads with the real Standard Webhooks algorithm):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 8000 roam --path /webhooks/roam
```

Use the URL the CLI prints as the Webhook URL in Roam (HTTPS required), then click **Test**.

## What the handler does

- Reads the raw request body with `await request.body()` (any content type) and verifies the signature (400 on failure or missing headers)
- Skips the legacy tagged-id body (`type: "message"`) of an event and dedupes the v1 envelope on `webhook-id`
- Dispatches on `type`: `chat.message`, `chat.reaction`, `meeting.started`, `meeting.ended`, `lobby.booked`, `magicast.created`, `onair.event.created`
- Responds 200 quickly; Roam allows 3 seconds per attempt
