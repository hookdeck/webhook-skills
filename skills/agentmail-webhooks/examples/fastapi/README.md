# AgentMail Webhooks - FastAPI Example

Minimal FastAPI example of receiving [AgentMail](https://agentmail.to) webhooks with signature verification, using the official [`svix`](https://pypi.org/project/svix/) library that AgentMail recommends. Verification runs in a FastAPI dependency (`verified_agentmail_event`).

## Prerequisites

- Python 3.10+ (required by `svix` 2.x)
- An AgentMail account and a webhook signing secret (`whsec_...`)

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

3. Add your AgentMail webhook signing secret to `AGENTMAIL_WEBHOOK_SECRET` in `.env`. It's shown in the AgentMail Console when you create the webhook, or fetch it with `client.webhooks.get(webhook_id=...).secret` (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/agentmail`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with AgentMail's (Svix's) algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`, and cover every main event type, tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, missing headers, `event_id` deduplication, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 agentmail --path /webhooks/agentmail
```

Register the printed URL in the AgentMail Console (**Webhooks → Create Webhook**) or with `client.webhooks.create(url=..., event_types=["message.received"])`, then send an email to one of your inboxes.

## Notes

- The dependency verifies `await request.body()`. The signature covers the exact raw bytes, so don't verify a re-serialised `request.json()`.
- `svix` 2.x `Webhook.verify()` returns `None` and raises on failure. AgentMail's docs show `msg = wh.verify(...)`, which only works with svix 1.x, so this example calls `json.loads` after verification.
- If `AGENTMAIL_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- Deduplication uses the payload's `event_id`, not `svix-id`, because `svix-id` differs between organization, pod and inbox webhooks for the same event.
- AgentMail needs a `2xx` within **15 seconds**. Enqueue the event and process it asynchronously in production.
