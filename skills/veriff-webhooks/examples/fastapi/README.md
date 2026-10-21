# Veriff Webhooks - FastAPI Example

Minimal example of receiving Veriff webhooks (decision and event webhooks) with
`X-HMAC-SIGNATURE` verification. Veriff has no webhook-verification SDK, so the
HMAC-SHA256 check is implemented manually with Python's `hmac` and `hashlib`.

## Prerequisites

- Python 3.10+
- A Veriff account with an integration and its **shared secret key**

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

3. Add your integration's shared secret key to `.env` as `VERIFF_SHARED_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/veriff
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign request bodies with the same algorithm Veriff uses (hex HMAC-SHA256 of
the raw body) and include the test vector published in Veriff's docs.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 veriff --path /webhooks/veriff
```

1. In the Veriff Customer Portal, open **Integrations** → your integration → **Settings**.
2. Paste the tunnel URL into **Webhook decisions URL** (and **Webhook events URL** if you want event webhooks).
3. Start a test verification session and finish the flow to receive a decision webhook.

## Event Handling

Decision webhooks (`verification.status`):

- `approved`, `declined`, `resubmission_requested`, `review`, `expired`, `abandoned`

Event webhooks (`action`):

- `started`, `submitted`, `waiting_complete`, `waiting_continued`, `flow_finished`, `flow_cancelled`, `document_type_other_selected`

Respond `200` within 5 seconds. Veriff retries failed deliveries for up to a week and delivers at least once, so make your handler idempotent.
