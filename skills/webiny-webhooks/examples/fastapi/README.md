# Webiny Webhooks - FastAPI Example

Minimal example of receiving [Webiny](https://www.webiny.com) 6.x webhooks with Standard Webhooks signature verification (`webhook-id`, `webhook-timestamp`, `webhook-signature`). The verifier is hand-written because Webiny's secret is free text used as raw UTF-8 bytes; the `standardwebhooks` and `svix` libraries would base64-decode it and use the wrong key.

## Prerequisites

- Python 3.9+
- A Webiny 6.x project with a webhook configured and a signing secret set (on the webhook or in Webhook settings)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the signing secret **exactly as entered in Webiny** in `WEBINY_WEBHOOK_SECRET`: the webhook's own secret, or the global one in Webhook settings if the webhook has none. No `whsec_` prefix, no encoding. With neither set, Webiny signs with an empty key and deliveries fail verification.

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/webiny`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Webiny does and cover a valid delivery, svix-* headers, `whsec_` secrets, multiple and non-v1 signatures, tampered bodies, wrong secrets, missing headers, bad timestamps, the optional tolerance, duplicate deliveries and the fail-closed path.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 webiny --path /webhooks/webiny
```

Paste the printed URL as the endpoint of a webhook in the Webiny admin, then resend a delivery from the admin.

## Notes

- The route reads `await request.body()` and verifies before parsing the JSON.
- If `WEBINY_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- No timestamp window by default (retries and replays resend the original timestamp). Set `WEBINY_WEBHOOK_TOLERANCE_SECONDS` to opt in.
- Event names are registered by the installed Webiny apps; the handler dispatches on the envelope's `event` string.
- The handler dedupes on `webhook-id`, which stays the same across retries and resends.
