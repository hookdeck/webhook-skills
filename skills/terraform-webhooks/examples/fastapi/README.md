# Terraform Webhooks - FastAPI Example

Minimal example of receiving HCP Terraform (Terraform Cloud) and Terraform Enterprise
notification webhooks with `X-TFE-Notification-Signature` verification.

## Prerequisites

- Python 3.9+
- An HCP Terraform or Terraform Enterprise workspace with admin access
- A notification configuration (generic destination) with a **token**

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

3. Set `TERRAFORM_NOTIFICATION_TOKEN` in `.env` to the token you will enter on the
   notification configuration (it can't be viewed after saving).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 terraform --path /webhooks/terraform
```

Use the public URL it prints as the **Webhook URL** in **Workspace > Settings >
Notifications**, with the same token. Enabling the configuration sends a
`verification` request, which this handler answers with `200`.

## How It Works

- The route reads `await request.body()`, so any `Content-Type` verifies.
- The signature is the hex HMAC-SHA512 of the raw body keyed with the token. Missing
  or invalid signatures return `400`.
- Run payloads carry triggers in `notifications[]`; workspace payloads carry a
  top-level `trigger`. Both are dispatched.

## Test

```bash
pytest test_webhook.py -v
```
