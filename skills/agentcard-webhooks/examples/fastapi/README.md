# Agentcard Webhooks - FastAPI Example

Minimal example of receiving Agentcard webhooks with `AgentCard-Signature` verification.

## Prerequisites

- Python 3.9+
- Agentcard account with an org token, and a webhook endpoint created through the API (`POST /api/v2/webhook_endpoints`) so you have its `secret`

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's `secret` to `.env` (`AGENTCARD_WEBHOOK_SECRET`). Paste the whole value, including the `whsec_` prefix: Agentcard uses it as a plain HMAC key (this is not Standard Webhooks, so don't strip or base64-decode it). The create response carries it once; `GET /api/v2/webhook_endpoints/{id}/secret` reads it again.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` in a dependency, verifies `AgentCard-Signature` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`; the legacy `X-AgentCard-Signature` header is not used), then dispatches on the envelope's `type` (for example `card.created`, `transaction.authorized`, `balance.low`). The timestamp check is off by default because retries and replays keep the original timestamp; set `AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 agentcard --path /webhooks/agentcard
```

Use the Hookdeck URL as the endpoint `url` when you create it with `POST https://api.agentcard.sh/api/v2/webhook_endpoints`, with `"enabled_events": ["card.*", "transaction.*", "balance.low", "approval.requested", "checkout_authorization.*"]`. Paste the returned `whsec_...` secret into Hookdeck's Agentcard source as-is, whole.
