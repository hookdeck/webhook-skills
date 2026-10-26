# Skovik Webhooks - FastAPI Example

Minimal example of receiving [Skovik](https://developer.skovik.com/docs/api-webhooks-receiving) webhooks with signature verification. Skovik signs deliveries with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the dependency verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Python 3.9+
- A Skovik account where you can manage webhook endpoints in the settings UI
- The endpoint's signing secret (`whsec_...`)

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

3. Put the endpoint's signing secret in `SKOVIK_WEBHOOK_SECRET`, including the `whsec_` prefix (see [setup](../../references/setup.md)). Each endpoint has its own secret.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/skovik` ([main.py](main.py)).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests the way Skovik does and cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, another endpoint's secret, duplicate event ids, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 skovik --path /webhooks/skovik
```

Add an HTTPS endpoint in Skovik's settings using the URL the CLI prints, then use the settings UI's test button to send a signed `misc.ping`.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- If `SKOVIK_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- Delivery is at-least-once. The handler dedupes on the body's `data.id` (the event id).
- Skovik times out after **5 seconds**. Enqueue the event and process it asynchronously in production.
