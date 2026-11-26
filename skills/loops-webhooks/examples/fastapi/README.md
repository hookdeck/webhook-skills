# Loops Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Loops](https://loops.so/docs/webhooks) webhooks with signature verification (`Webhook-Id` / `Webhook-Timestamp` / `Webhook-Signature`, base64-decoded secret).

## Prerequisites

- Python 3.9+
- A Loops account (webhooks are available to all Loops users)

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LOOPS_WEBHOOK_SECRET` to the signing secret shown in Loops under [Settings -> Webhooks](https://app.loops.so/settings?page=webhooks) (see [setup](../../references/setup.md)). Paste it as shown, with or without a `whsec_` prefix.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/loops` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests the way Loops does. They check the Standard Webhooks reference vector (with and without `whsec_`, and end to end), `contact.created`, email events and `testing.testEvent` payloads from the Loops docs, two signatures after a secret roll, a secret used without decoding, tampered bodies, the optional timestamp window, repeated deliveries (same `Webhook-Id`), and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 loops --path /webhooks/loops
```

Paste the printed URL as the endpoint in Loops (Settings -> Webhooks), toggle on the events you want, and send a test request from the same page. Loops allows one endpoint per account, so this replaces any URL already set.

## Notes

- The handler reads `await request.body()` before parsing. The signature covers the exact raw body, so verifying a re-serialised `request.json()` breaks it.
- If `LOOPS_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- `LOOPS_WEBHOOK_TOLERANCE_SECONDS` turns on a timestamp window (Loops' example uses 300 seconds). It's off by default because a delivery replayed later through a relay keeps its original timestamp; duplicates are caught by `Webhook-Id` instead.
- Respond within 15 seconds. Loops retries non-`2xx` responses, up to eight attempts over about 28 hours.
