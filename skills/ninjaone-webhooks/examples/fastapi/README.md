# NinjaOne Webhooks - FastAPI Example

Minimal example of receiving [NinjaOne](https://www.ninjaone.com/) activity webhooks in
FastAPI, authenticated with a shared-secret header.

NinjaOne doesn't sign webhooks. The endpoint compares the `X-Webhook-Secret` header with
`NINJAONE_WEBHOOK_SECRET` using `hmac.compare_digest`, returns `401` on a mismatch, and
returns `500` if the secret isn't configured.

## Prerequisites

- Python 3.10+
- A NinjaOne tenant and an API client (application) that can call `PUT /v2/webhook`
  (NinjaOne returns `403` unless it's a system administrator)
- A secret you generate yourself: `openssl rand -hex 32`

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

3. Put your secret in `.env` as `NINJAONE_WEBHOOK_SECRET`.

4. Register the webhook through the API, with the secret as a custom header
   (see [setup.md](../../references/setup.md)):
   ```bash
   curl -X PUT https://app.ninjarmm.com/v2/webhook \
     -H "Authorization: Bearer $NINJA_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://your-host/webhooks/ninjaone",
       "activities": { "CONDITION": ["TRIGGERED", "RESET"] },
       "headers": [{ "name": "X-Webhook-Secret", "value": "<your secret>" }]
     }'
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/ninjaone`.

## Test

Run the tests:

```bash
pytest test_webhook.py -v
```

Receive real webhooks locally with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 ninjaone --path /webhooks/ninjaone
```

Use the URL it prints as the `url` in the `PUT /v2/webhook` call.
