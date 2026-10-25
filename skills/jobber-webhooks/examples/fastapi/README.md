# Jobber Webhooks - FastAPI Example

Minimal example of receiving Jobber webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A Jobber app in the [Developer Center](https://developer.getjobber.com/) and its OAuth client secret

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

3. Add your Jobber app's OAuth client secret to `.env` as `JOBBER_CLIENT_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, webhook endpoint `POST /webhooks/jobber`.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 8000 jobber --path /webhooks/jobber
```

Then add the Hookdeck URL as the webhook URL for your app in the Jobber Developer Center and subscribe to topics such as `CLIENT_CREATE`.

## Notes

- The handler reads `await request.body()` so the signed raw bytes are used, whatever the content type.
- Signature comparison uses `hmac.compare_digest` on bytes, so a non-ASCII header returns 401, not 500.
- Jobber expects a response within 1 second: acknowledge first, do heavy work in a background job.
