# Sendoso Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Sendoso](https://sendoso.com) send status webhooks with Svix signature verification, using the official [`svix`](https://pypi.org/project/svix/) package. Verification runs in a FastAPI dependency (`verified_sendoso_payload`).

## Prerequisites

- Python 3.9+
- Sendoso webhooks enabled for your organization (email developers@sendoso.com)
- An endpoint in the Sendoso webhooks portal (linked from the integrations page) and its `whsec_` signing secret

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

3. Add your endpoint's signing secret to `SENDOSO_WEBHOOK_SECRET` in `.env`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/sendoso`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Sendoso's Svix algorithm (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`). They cover tampered bodies, wrong secrets, stale and future timestamps, multiple and malformed signatures, duplicate and out-of-order deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 sendoso --path /webhooks/sendoso
```

Add the printed URL as an endpoint in the Sendoso webhooks portal, copy that endpoint's signing secret into your env file, then send an example event from the endpoint's **Testing** tab.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- In `svix` 2.x, `Webhook.verify()` raises on failure and returns `None`, so the dependency parses the body with `json.loads()` only after verification succeeds. Malformed headers can raise errors other than `WebhookVerificationError`, so the dependency catches `Exception` and returns `400`.
- Every Sendoso event type shares the documented payload `{ "send_gid", "status_changed_at" }`, and that payload doesn't name the event type. Subscribe the endpoint only to the events it should act on (or look the send up by `send_gid`). The handler dedupes on `svix-id` and ignores updates whose `status_changed_at` is older than the last one it saw for that send.
- If `SENDOSO_WEBHOOK_SECRET` is unset, the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Sendoso times out after **15 seconds**. In production, enqueue the work and respond right away.
