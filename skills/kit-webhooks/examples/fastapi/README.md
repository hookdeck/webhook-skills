# Kit Webhooks - FastAPI Example

Minimal example of receiving Kit (formerly ConvertKit) webhooks with `X-Kit-Signature` verification.

## Prerequisites

- Python 3.10+
- A Kit account on a plan with API access, and a webhook endpoint created via `POST /v4/webhook_endpoints` or at [app.kit.com/webhooks](https://app.kit.com/webhooks)

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

3. Add your Kit endpoint secret (`whsec_...`, returned once when the endpoint is created) to `.env` as `KIT_WEBHOOK_SECRET`. Use the whole string, prefix included.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/kit`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 kit --path /webhooks/kit
```

Register the tunnel URL as the endpoint `url` (Kit only delivers to public URLs), subscribe to `subscriber.created`, then add a subscriber in Kit.

## How verification works

The `X-Kit-Signature` header is `t=<unix>,v1=<hex>` (two `v1` entries during secret rotation). The handler reads the raw bytes with `await request.body()`, computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))` with the `whsec_` secret used whole as UTF-8 key bytes, and compares it with `hmac.compare_digest` against every `v1`. The timestamp check is off by default, because Hookdeck retries and replays keep the original `t`. Set `KIT_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (Kit suggests `300`) to turn it on. The body is an envelope with an `events` array; deduplicate on each event's `id`. See [../../references/verification.md](../../references/verification.md).
