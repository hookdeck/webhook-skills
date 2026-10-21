# Gravity Forms Webhooks - FastAPI Example

Minimal example of receiving [Gravity Forms](https://www.gravityforms.com/) form
submission webhooks (Webhooks Add-On) in FastAPI, authenticated with a shared-secret
request header.

Gravity Forms doesn't sign webhooks. This example compares the `X-Webhook-Secret` header
with `GRAVITY_FORMS_WEBHOOK_SECRET` in constant time, returns `401` on a mismatch, and
returns `500` if the secret isn't configured.

## Prerequisites

- Python 3.9+
- A WordPress site with Gravity Forms and the Webhooks Add-On installed and activated
- A secret you generate yourself: `openssl rand -hex 32`

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

3. Put your secret in `.env` as `GRAVITY_FORMS_WEBHOOK_SECRET`.

4. In WordPress, open the form → **Settings → Webhooks → Add New** and set:
   - Request URL: your endpoint (`/webhooks/gravity-forms`)
   - Request Method: `POST`
   - Request Format: `JSON` (urlencoded `FORM` also works)
   - Request Headers: name `X-Webhook-Secret`, value = your secret
   - Request Body: `All Fields`, or `Select Fields` (include the entry `id` to deduplicate)

## Run

```bash
python main.py
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/gravity-forms`.

## Test

Run the tests:

```bash
pytest test_webhook.py -v
```

Receive real webhooks locally with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 gravity-forms --path /webhooks/gravity-forms
```

Use the URL it prints as the Request URL in the feed, then submit the form.

Or send a request with curl:

```bash
curl -X POST http://localhost:8000/webhooks/gravity-forms \
  -H "X-Webhook-Secret: $GRAVITY_FORMS_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"id":"101","form_id":"3","1":"Ada Lovelace","2":"ada@example.com"}'
```

## How It Works

- The handler reads `await request.body()` only after the header check passes.
  Gravity Forms signs nothing, so the raw body isn't needed for verification.
- JSON and urlencoded bodies are both accepted, matching the feed's **Request Format**.
- Repeated entry `id`s are acknowledged as duplicates. Swap the in-memory `Set` for a
  database in production.
