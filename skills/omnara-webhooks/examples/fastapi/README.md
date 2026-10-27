# Omnara Webhooks - FastAPI Example

Minimal example of receiving Omnara event webhooks with Standard Webhooks signature verification
(`standardwebhooks` library, `webhook-*` headers with a `svix-*` fallback).

## Prerequisites

- Python 3.9+
- An Omnara agent config with `event_webhook` set. Signing is opt-in: set
  `event_webhook.signing_secret_id` to a generic secret generated with `openssl rand -base64 32`

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

3. Put the signing secret in `OMNARA_WEBHOOK_SECRET`, exactly as stored in Omnara (a `whsec_` prefix also works)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

Receive real deliveries locally with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 omnara --path /webhooks/omnara
```

Then set the agent's `event_webhook.url` to the tunnel URL.

## Notes

- The route reads `await request.body()` so the exact bytes are verified before parsing.
- Handled events: `agent_input`, `model_output`, `tool_result`, `context_checkpoint`, `tool_call_update`.
- Missing headers or a bad signature return 400; with no `OMNARA_WEBHOOK_SECRET` the handler returns 500.
- The library enforces a fixed 5-minute timestamp window, so Hookdeck retries and replays older
  than that are rejected. See `references/verification.md` for a manual verifier without the window.
