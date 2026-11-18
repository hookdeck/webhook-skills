# Dial Webhooks - FastAPI Example

Minimal example of receiving Dial webhooks with signature verification.

Dial has no published webhook verification SDK, so this example verifies the
`X-Dial-Signature` header (`t=<unix-seconds>,v1=<hex>`, HMAC-SHA256 of `{t}.{raw body}`
keyed with the full `whsec_` secret) manually with `hmac`, comparing bytes with
`hmac.compare_digest`.

## Prerequisites

- Python 3.10+
- A Dial webhook subscription and its signing secret

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

3. Add the full signing secret (including `whsec_`) to `.env` as `DIAL_WEBHOOK_SECRET`.
   Get it from the dashboard or `GET https://api.getdial.ai/api/v1/webhooks/{id}/secret`.

Behind Hookdeck, raise `DIAL_WEBHOOK_TOLERANCE_SECONDS` (or set `0`): Hookdeck retries
and replays keep the original signed timestamp.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 dial --path /webhooks/dial
```

Use the printed HTTPS URL as the subscription's `targetUrl`, then click **Fire ping**
in the dashboard or call `POST https://api.getdial.ai/api/v1/webhooks/{id}/ping` to send
a signed `webhook.ping` event.
