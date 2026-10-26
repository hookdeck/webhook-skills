# Airweave Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Airweave](https://airweave.ai) webhooks with signature verification, using the official [`svix`](https://pypi.org/project/svix/) library that Airweave recommends for production. Verification runs in a FastAPI dependency (`verified_airweave_event`).

## Prerequisites

- Python 3.10+ (required by `svix` 2.x)
- An Airweave account and a webhook subscription signing secret (`whsec_...`)

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

3. Add your subscription's signing secret to `AIRWEAVE_WEBHOOK_SECRET` in `.env`. Fetch it with `GET /webhooks/subscriptions/{id}?include_secret=true` (see [setup](../../references/setup.md)). If you set a custom secret, paste the whsec_ secret Airweave returns for the subscription, not the value you sent.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/airweave`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Airweave's (Svix's) algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`, and cover all 11 documented event types, tampered bodies, wrong secrets, stale and future timestamps, multiple signatures, missing headers, `svix-id` deduplication, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 airweave --path /webhooks/airweave
```

Register the printed URL as a subscription (`POST https://api.airweave.ai/webhooks/subscriptions` with `url` and `event_types`), then trigger a sync.

## Notes

- The dependency reads the raw bytes with `await request.body()`. The signature covers the exact raw body, so verifying `request.json()` output breaks it.
- `svix` 2.x `verify()` returns `None` and raises on failure. `verify_airweave_webhook` parses the JSON itself after verification.
- The Svix library always enforces a 5-minute timestamp window. Retries and replays (for example from Hookdeck) keep the original timestamp, so a late retry is rejected. See [verification](../../references/verification.md) for a manual verifier where you can drop or widen the window.
- If `AIRWEAVE_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- Deduplication uses `svix-id`, which stays the same across retries of a message. Airweave payloads carry no event ID field.
- Airweave times out after 30 seconds. Enqueue the event and process it asynchronously in production.
