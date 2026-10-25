# AgentLine Webhooks - FastAPI Example

Minimal example of receiving AgentLine webhooks with signature verification.

AgentLine has no published Python webhook verifier, so this example verifies the
`X-Webhook-Signature` header (bare hex HMAC-SHA256 of the raw body) manually with
`hmac` and compares as bytes with `hmac.compare_digest`.

## Prerequisites

- Python 3.9+
- An AgentLine webhook and its signing secret (shown once at creation)

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

3. Add your signing secret to `.env` as `AGENTLINE_WEBHOOK_SECRET`

Keep the default `X-Webhook-Signature` header on the webhook; a custom
`signature_header` isn't supported by Hookdeck's AgentLine source.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 agentline --path /webhooks/agentline
```

Use the printed URL as the webhook `url` for your agent, then call
`POST /v1/webhooks/test?agent_id=...` to send a signed `webhook.test` event.
