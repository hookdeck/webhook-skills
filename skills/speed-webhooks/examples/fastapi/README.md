# Speed Webhooks - FastAPI Example

Minimal example of receiving [Speed](https://www.tryspeed.com) webhooks with signature verification. Speed signs deliveries in the [Standard Webhooks](https://www.standardwebhooks.com) layout, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. If `webhook-id` is absent it reads the `svix-*` headers instead, as Hookdeck does. Speed's secret starts with `wsec_`, which the handler turns into `whsec_` before giving it to the library.

## Prerequisites

- Python 3.9+
- A Speed account with a webhook endpoint, and its signing secret (`wsec_...`)

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

3. Put your endpoint's signing secret in `SPEED_WEBHOOK_SECRET`, exactly as Speed shows it (with the `wsec_` prefix). Reveal it under **Developers > Webhooks** (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/speed`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Speed does (`base64(HMAC-SHA256(base64decode(secret after "wsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover payment, checkout session, withdrawal and Connect events, tampered bodies, stale timestamps, multiple signatures, another endpoint's secret, retried deliveries, deliveries sent with `svix-*` headers, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 speed --path /webhooks/speed
```

Register the printed URL as an endpoint under **Developers > Webhooks**, subscribe to events such as `payment.paid`, then trigger one (or retry a message from the dashboard).

## Notes

- The handler reads the body with `await request.body()`. The signature covers the exact raw body bytes, so a parsed model parameter before verification breaks it.
- If `SPEED_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. A retry or replay through Hookdeck keeps its original timestamp and is rejected once it is more than 5 minutes old. See [verification.md](../../references/verification.md) for a manual verifier where the window can be dropped.
- Speed re-signs each retry with a new `webhook-id`, so the handler dedupes on the event `id` (`evt_…`), which stays the same. Compare `modified` before overwriting newer data.
- Reply `2xx` quickly: any other status is retried. Enqueue the event and process it asynchronously in production.
