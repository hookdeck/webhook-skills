# Pulumi Webhooks - FastAPI Example

Minimal example of receiving Pulumi Cloud webhooks with `Pulumi-Webhook-Signature` verification.

## Prerequisites

- Python 3.9+
- A Pulumi Cloud organization with a webhook that has a **shared secret**

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the shared secret you set on the Pulumi webhook to `.env` (`PULUMI_WEBHOOK_SECRET`).

Set a shared secret on the Pulumi webhook. Without one, deliveries are unsigned and fail verification.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` in a FastAPI dependency, verifies `Pulumi-Webhook-Signature` (bare lowercase hex HMAC-SHA256 of the raw body, keyed with the secret), then dispatches on the `Pulumi-Webhook-Kind` header (`stack`, `stack_update`, `stack_preview`, `deployment`, `drift_detection`, `drift_remediation`; others, including `policy_violation`, are logged). Nothing time-based is signed, so there is no replay window to check.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 pulumi --path /webhooks/pulumi
```

Use the Hookdeck URL as the webhook's payload URL in Pulumi Cloud, then trigger a stack update.
