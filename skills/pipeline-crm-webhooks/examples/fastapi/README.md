# Pipeline CRM Webhooks - FastAPI Example

Minimal example of receiving [Pipeline CRM](https://www.pipelinecrm.com) webhooks with signature verification. Pipeline CRM signs deliveries with [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp`, `webhook-signature`), verified here with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package.

## Prerequisites

- Python 3.9+
- A Pipeline CRM account with access to **Admin > Automations**
- The `whsec_` secret from **Enable signing** on the automation's **Call an API** action

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

3. Signing is opt-in. Click **Enable signing** under **Request signing** on the **Call an API** action and put the secret (shown once) in `PIPELINE_CRM_WEBHOOK_SECRET`. Without it, deliveries are unsigned and the handler answers `400`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/pipeline-crm`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads the way Pipeline CRM does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover `deal.create`, `deal.update`, `person.create` and `company.destroy`, tampered bodies, stale timestamps, multiple signatures, another secret, retried deliveries, unsigned deliveries and the fail-closed path.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 pipeline-crm --path /webhooks/pipeline-crm
```

Paste the printed URL as the target URL of the **Call an API** action, click **Test** (the automation can only be saved once your URL answers `2xx`), then change a deal or person.

## Notes

fastapi0
- If `PIPELINE_CRM_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- There is no event type string. The handler dispatches on `{event_model}.{event_action}` (for example `deal.update`).
- The payload has no event ID. The handler dedupes on the `webhook-id` header, which stays the same across retries.
- The `standardwebhooks` library always rejects a `webhook-timestamp` older than 5 minutes. Hookdeck retries and replays resend the original timestamp, so use the manual verifier in [verification.md](../../references/verification.md) if you need a wider or no window.
- Return `2xx` within a few seconds and process asynchronously in production.
