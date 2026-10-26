# Digital Samba Webhooks - FastAPI Example

Minimal example of receiving Digital Samba webhooks and authenticating them with the `Authorization: Bearer <secret>` header.

Digital Samba does not sign payloads, so there is no HMAC to verify. The handler compares the bearer secret with `DIGITAL_SAMBA_WEBHOOK_SECRET` in constant time. A static credential authenticates the sender, not the body, and gives no replay protection. The route reads the raw body, so any content type works.

## Prerequisites

- Python 3.9+
- A Digital Samba webhook created with an `authorization_header` (see [../../references/setup.md](../../references/setup.md))

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

3. Set `DIGITAL_SAMBA_WEBHOOK_SECRET` to the bare secret you used as `authorization_header`. Set authorization_header on the webhook through the Digital Samba REST API, then paste the same secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/digital-samba`.

## Test

```bash
pytest test_webhook.py
```

The tests send documented-shape events with correct, wrong and missing secrets. No Digital Samba account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/digital-samba \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITAL_SAMBA_WEBHOOK_SECRET" \
  -d '{"eventType":"participant_joined","sessionId":"s1","roomId":"r1","timestamp":1675790387,"data":{"participantId":"p1","name":"John Smith","role":"moderator"}}'
```

## Receive Webhooks Locally

Digital Samba can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 digital-samba --path /webhooks/digital-samba
```

Use the printed URL as the webhook `endpoint`.

## How It Works

- `main.py`: `verify_digital_samba_request()`, a dependency that runs before the body is read, and the `POST /webhooks/digital-samba` route

1. The bearer secret is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `eventType`: `participant_joined`, `participant_left`, `session_started`, `session_ended`, `recording_started`, `recording_stopped`, `recording_ready`, `recording_deleted`, `session_summary_ready`, `session_transcript_ready`.
4. It returns `200 {"received": true}`.
