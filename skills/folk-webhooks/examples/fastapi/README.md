# folk Webhooks - FastAPI Example

Minimal FastAPI example of receiving [folk](https://www.folk.app) (CRM) webhooks with signature verification. folk follows the Standard Webhooks spec, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the official [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library, which folk recommends. Verification runs in a FastAPI dependency (`verified_folk_event`).

## Prerequisites

- Python 3.9+
- A folk workspace with access to the API settings page
- The signing secret (`whsec_...`) of your webhook. folk shows it only once, when the webhook is created

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

3. Put your webhook's signing secret in `FOLK_WEBHOOK_SECRET`. folk shows it only once, at webhook creation (see [setup](../../references/setup.md)).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/folk`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way Standard Webhooks does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover every event type, tampered bodies, stale timestamps, multiple signatures, another webhook's secret, redelivered events, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 folk --path /webhooks/folk
```

Create a webhook in your workspace API settings (or with `POST https://api.folk.app/v1/webhooks`) that targets the printed URL, subscribe to events such as `person.created`, then create a person in folk. Save the secret shown at creation into `FOLK_WEBHOOK_SECRET`.

## Notes

- The dependency (`verified_folk_event`) reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- If `FOLK_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The library enforces a fixed **5-minute** timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones are rejected. See [verification](../../references/verification.md) for a manual verifier where the window can be dropped or widened.
- The handler dedupes on the `webhook-id` header (same as the payload's `id`), which stays the same across redeliveries.
- Return a `2xx` quickly and process asynchronously. A `410 Gone` response deactivates the webhook immediately.
