# Fillout Webhooks - FastAPI Example

Minimal example of receiving [Fillout](https://www.fillout.com/) form submission webhooks
in FastAPI, authenticated with an `Authorization: Bearer <token>` header.

Fillout doesn't sign webhooks. The endpoint compares the whole `Authorization` header with
`Bearer {FILLOUT_WEBHOOK_TOKEN}` using `hmac.compare_digest`, returns `401` on a mismatch,
and returns `500` if the token isn't configured.

## Prerequisites

- Python 3.10+
- A Fillout form you can edit
- A token you generate yourself: `openssl rand -hex 32`

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

3. Put your token in `.env` as `FILLOUT_WEBHOOK_TOKEN` (without `Bearer `).

4. In Fillout, open the form → **Integrate** → **Webhook**, switch to **Advanced**, and:
   - HTTP method: `POST`
   - Body: map `submissionId` → Submission ID, plus the answers you need
   - Headers: `Authorization` = `Bearer <your token>`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/fillout`.

## Test

Run the tests:

```bash
pytest test_webhook.py -v
```

Receive real webhooks locally with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 fillout --path /webhooks/fillout
```

Use the URL it prints as the webhook URL in Fillout and click **Test**.
