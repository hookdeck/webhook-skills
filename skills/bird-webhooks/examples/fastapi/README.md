# Bird Webhooks - FastAPI Example

Minimal example of receiving [Bird](https://bird.com) (formerly MessageBird) webhooks with signature verification. Bird follows the [Standard Webhooks](https://www.standardwebhooks.com) spec, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package.

The legacy MessageBird API (`MessageBird-Signature` / `MessageBird-Signature-JWT`) is a different scheme and is not covered here.

## Prerequisites

- Python 3.9+
- A Bird workspace with a webhook endpoint (Platform tools > Webhooks, the `bird` CLI, or `POST /v1/webhooks`)
- The endpoint's signing secret (`whsec_...`), which Bird returns only once, at creation

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

3. Put the endpoint's signing secret in `BIRD_WEBHOOK_SECRET`. If you lost it, rotate it with `POST /v1/webhooks/{webhook_id}/rotate-secret` (see [setup](../../references/setup.md)).

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/bird`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Bird does (`v1,` + `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, stale timestamps, multiple signatures during rotation, another endpoint's secret, non-JSON content types, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 bird --path /webhooks/bird
```

Register the printed URL as a Bird webhook endpoint, subscribing to types such as `email.delivered` and `whatsapp.received`, then use `POST /v1/webhooks/{webhook_id}/test` or a sandbox send to trigger a delivery.

## Notes

- The dependency reads `await request.body()`, the exact raw bytes whatever the Content-Type. Parsing JSON before verification breaks the signature.
- A failed verification returns `400`. Bird retries any non-2xx, so fixing a missing or rotated secret still recovers the event.
- If `BIRD_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Bird delivers at-least-once. The handler dedupes on the `webhook-id` header, which stays the same across retries and replays.
- Bird waits **15 seconds** for a `2xx`. Enqueue the event and process it asynchronously in production.
