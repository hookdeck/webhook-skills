# Bayou Energy Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Bayou Energy](https://www.bayou.energy) webhooks with signature verification. Bayou signs deliveries per the Standard Webhooks spec, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. Verification runs in a FastAPI dependency (`verified_bayou_event`).

## Prerequisites

- Python 3.9+
- A Bayou Energy company account
- The company's signing secret (`whsec_...`)

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

3. Put your signing secret, including the `whsec_` prefix, in `BAYOU_ENERGY_WEBHOOK_SECRET`. Find it in the Bayou dashboard under **Settings**, below the Webhook URL (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/bayou-energy`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Bayou does, including the test vector from Bayou's docs. They cover tampered bodies, stale timestamps, multiple signatures, another secret, an undecoded key, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 bayou-energy --path /webhooks/bayou-energy
```

Paste the printed URL into the **Webhook URL** field in the Bayou dashboard settings.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- The `standardwebhooks` library rejects timestamps more than 5 minutes off. Hookdeck retries and replays resend the original timestamp, so use the manual verifier in [verification.md](../../references/verification.md) if you need to drop or widen the window.
- If `BAYOU_ENERGY_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Bayou payloads have no event ID. The handler dedupes on the `webhook-id` header.
