# General Translation Webhooks - FastAPI Example

Minimal example of receiving [General Translation](https://generaltranslation.com) webhooks with signature verification. Deliveries are signed with Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`) and verified with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. If `webhook-id` is absent the handler falls back to the `svix-*` header names, as Hookdeck does.

## Prerequisites

- Python 3.9+
- A General Translation organization on the Starter or Enterprise plan
- The signing secret (`whsec_...`) of your webhook endpoint

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

3. Put your endpoint's signing secret in `GENERAL_TRANSLATION_WEBHOOK_SECRET` (keep the `whsec_` prefix). Copy it from the endpoint's detail page under **Organization > Developer > Webhooks** (see [setup](../../references/setup.md)). Each endpoint has its own secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/general-translation`.

## Test

```bash
fastapi0
```

The tests sign payloads the way Standard Webhooks does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover the three event types, `svix-*` header fallback, tampered bodies, stale timestamps, multiple signatures, ignored `v1a` entries, another endpoint's secret, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 general-translation --path /webhooks/general-translation
```

Add the printed HTTPS URL as an endpoint in **Organization > Developer > Webhooks**, select event types such as `translated_file.completed` and `translation_job.completed`, then complete a translation.

## Notes

- fastapi1
- If `GENERAL_TRANSLATION_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones are rejected. For a configurable window use the manual verifier in [references/verification.md](../../references/verification.md).
- The handler dedupes on the event `id` (`evt_...`, equal to `webhook-id`), which stays the same across retries.
- General Translation needs a `2xx` within **10 seconds**. Enqueue the event and process it asynchronously in production.
