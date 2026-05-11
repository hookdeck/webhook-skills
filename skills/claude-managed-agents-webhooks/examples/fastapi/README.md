# Claude Managed Agents Webhooks - FastAPI Example

FastAPI example for receiving Anthropic Claude Managed Agents (CMA) webhooks with Standard Webhooks signature verification.

## Prerequisites

- Python 3.9+
- An Anthropic workspace with CMA access and a webhook endpoint configured in [Console](https://platform.claude.com/settings/workspaces/default/webhooks)
- The `whsec_`-prefixed signing key generated at endpoint creation

## Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your signing key to `.env`:
   ```
   ANTHROPIC_WEBHOOK_SIGNING_KEY=whsec_...
   ```

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000. Interactive docs at http://localhost:8000/docs.

## Test with Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 claude-managed-agents --path /webhooks/claude-managed-agents
```

Paste the public URL Hookdeck prints into Console as the webhook endpoint URL.

## Test

```bash
pytest test_webhook.py -v
```

The test suite generates real Standard Webhooks signatures against the configured `whsec_` secret and exercises every supported CMA event type.

## Endpoints

- `POST /webhooks/claude-managed-agents` — webhook receiver
- `GET /health` — health check
- `GET /docs` — interactive API documentation

## Events Handled

Session events:

- `session.status_run_started`
- `session.status_idled`
- `session.status_rescheduled`
- `session.status_terminated`
- `session.thread_created`
- `session.thread_idled`
- `session.thread_terminated`
- `session.outcome_evaluation_ended`

Vault events:

- `vault.created`, `vault.archived`, `vault.deleted`
- `vault_credential.created`, `vault_credential.archived`, `vault_credential.deleted`
- `vault_credential.refresh_failed`

## Anthropic SDK Alternative

If you'd rather use the Anthropic Python SDK, install `anthropic[webhooks]` and replace `verify_claude_signature` + `json.loads(...)` with:

```python
import anthropic
client = anthropic.Anthropic()  # reads ANTHROPIC_WEBHOOK_SIGNING_KEY from env

event = client.beta.webhooks.unwrap(payload.decode("utf-8"), headers=dict(request.headers))
```

`unwrap()` raises if the signature is invalid or the payload is more than five minutes old.
