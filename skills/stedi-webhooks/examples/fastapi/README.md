# Stedi Webhooks - FastAPI Example

Minimal example of receiving [Stedi](https://www.stedi.com) event destination webhooks with signature verification in FastAPI. Stedi follows the [Standard Webhooks](https://www.standardwebhooks.com) specification: `webhook-id`, `webhook-timestamp` and `webhook-signature` headers.

## Prerequisites

- Python 3.9+
- A Stedi account with an event destination and its signing secret (`whsec_...`)

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

3. Put the destination's signing secret in `STEDI_WEBHOOK_SECRET`. Copy it from the destination's **Overview** tab in the Stedi portal, or fetch it with `GET /destinations/{id}/secret` (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/stedi`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the Standard Webhooks way (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, the docs' `timestamp.body` variant (rejected), secret rotation (several signatures), another destination's secret, retried deliveries, the optional timestamp window, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 stedi --path /webhooks/stedi
```

Create an event destination in the Stedi portal pointing at the printed URL, subscribe to events such as `transaction.processed` and `enrollment.activated`, then click **Ping** on the destination's **Event deliveries** tab.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw body bytes, so parsing JSON before verification breaks it.
- Verification is manual rather than the `standardwebhooks` package. `webhook-timestamp` is when Stedi **created** the event, and Stedi retries for up to 48 hours. The package's fixed 5-minute window would reject every retry. Set `STEDI_TIMESTAMP_TOLERANCE_SECONDS` if you want a window anyway.
- If `STEDI_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- Stedi events are thin: they carry `type`, `resource` and `relatedResources`, not the data. Call the Stedi API for the current state.
- The handler dedupes on `webhook-id`, which stays the same across retries. Stedi only treats `2xx` as success and does not follow redirects.
