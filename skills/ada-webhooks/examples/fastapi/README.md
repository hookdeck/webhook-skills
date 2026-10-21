# Ada Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Ada](https://www.ada.cx) webhooks with signature verification. Ada delivers webhooks through Svix, so the handler verifies the `svix-id`, `svix-timestamp` and `svix-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package (the Svix-maintained reference implementation of the same scheme). Verification runs in a FastAPI dependency (`verified_ada_event`).

## Prerequisites

- Python 3.9+
- An Ada AI Agent with access to **Config > PLATFORM > Webhooks**
- The signing secret (`whsec_...`) of your webhook endpoint

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your endpoint's signing secret in `ADA_WEBHOOK_SECRET`. Copy it from the endpoint page in the Ada dashboard, or fetch it with `GET /api/v2/webhooks/{id}/secret/` (see [setup](../../references/setup.md)). Each endpoint has its own secret.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/ada`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Svix does and cover tampered bodies, stale timestamps, multiple signatures, another endpoint's secret, an undecoded key, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 ada --path /webhooks/ada
```

Add the printed URL as an endpoint in **Config > PLATFORM > Webhooks**, select event types such as `v1.conversation.created` and `v1.conversation.ended`, then start a conversation with your AI Agent.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- If `ADA_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Ada payloads have no top-level event ID. The handler dedupes on the `svix-id` header, which stays the same across retries.
- Ada needs a `2xx` within **15 seconds**. Enqueue the event and process it asynchronously in production.
