# Recruitee Webhooks - FastAPI Example

Minimal example of receiving Recruitee webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Recruitee account with a webhook secret (Settings > Apps and Plugins > Webhooks)

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

3. Add your Recruitee webhook secret to `.env` as `RECRUITEE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The endpoint is `POST /webhooks/recruitee`.

## Test

Run the automated tests (they sign payloads with the same HMAC-SHA256 scheme, and include the test vector from the Recruitee docs):

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, run the Hookdeck CLI in another terminal:

```bash
npx hookdeck-cli listen 8000 recruitee --path /webhooks/recruitee
```

Then use the Hookdeck URL as the **POST URL** in Recruitee and click **Verify and create**.

## Notes

- The route reads `await request.body()` so the raw bytes are verified.
- The `{"test":true}` request sent on **Verify and create** gets a 200.
- Recruitee treats any status other than 200 as a failed delivery and retries.
