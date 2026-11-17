# Sent Webhooks - FastAPI Example

Minimal example of receiving [Sent](https://sent.dm) (sent.dm) webhooks with signature verification. Sent signs deliveries with the Standard Webhooks scheme: version 2 webhooks (the default) send `webhook-id`, `webhook-timestamp` and `webhook-signature`, and version 1 webhooks send `x-webhook-id`, `x-webhook-timestamp` and `x-webhook-signature`. The handler reads version 2's headers first, falls back to version 1's, and passes them under the names the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package reads.

## Prerequisites

- Python 3.9+
- A Sent account with a webhook (Dashboard > Webhooks, or `POST /v3/webhooks`)
- The webhook's signing secret (`whsec_...`)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's signing secret in `SENT_WEBHOOK_SECRET` (see [setup](../../references/setup.md)).

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/sent-dm`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way a version 1 Sent webhook does (`v1,` + `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{X-Webhook-ID}.{X-Webhook-Timestamp}.{raw body}"))`). Version 2 signs the same string built from `webhook-id` and `webhook-timestamp`. They cover tampered bodies, stale timestamps, multiple signatures, another webhook's secret, non-JSON content types, dedupe on `X-Webhook-Event-ID`, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 sent-dm --path /webhooks/sent-dm
```

Register the printed URL as the endpoint of a Sent webhook, then use **Test Webhook** in the dashboard to send a sample event.

## Notes

- The route reads the body with `await request.body()`. The signature covers the exact raw body bytes, and this verifies any content type. Binding a Pydantic model or calling `request.json()` before verification breaks it.
- Missing headers return `400`, a bad signature or stale timestamp `401`, no configured secret `503` (the response contract in Sent's receiver guide).
- The library enforces a fixed 5-minute timestamp window. Sent signs each retry when it sends it, so Sent's own retries pass. Hookdeck retries and replays resend the original timestamp, so behind Hookdeck use the manual verifier in [references/verification.md](../../references/verification.md) with the window widened or off.
- Dedupe on `webhook-id` (version 2) or `X-Webhook-Event-ID` (version 1). Version 1's `X-Webhook-ID` is the webhook's id and is identical on every event.
- Acknowledge fast. A version 1 webhook waits for its timeout (default 30 s) and is disabled after 10 consecutive failed events; a version 2 webhook is turned off when every delivery keeps failing for an hour after an event runs out of retries.
