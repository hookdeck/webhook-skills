# SurveyMonkey Webhooks - FastAPI Example

Minimal FastAPI example of receiving [SurveyMonkey](https://www.surveymonkey.com) webhooks and verifying the `Sm-Signature` HMAC (and answering the `HEAD` check).

## Prerequisites

- Python 3.9+
- A SurveyMonkey app with a client ID, client secret and the Create/Modify Webhooks scope (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SURVEYMONKEY_CLIENT_ID` and `SURVEYMONKEY_CLIENT_SECRET` in `.env`. The example joins them as `<client ID>&<client secret>`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/surveymonkey` (and `HEAD` for SurveyMonkey's URL check) in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover the `<client ID>&<secret>` key, a key of the secret alone (rejected), a hex signature (rejected), the `HEAD` check, a valid signature with the `application/vnd.surveymonkey.response.v1+json` content type, a survey event, another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and missing credentials.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 surveymonkey --path /webhooks/surveymonkey
```

Create a webhook with `POST /v3/webhooks` and the printed URL as `subscription_url`. A plain CLI source answers `HEAD` with `405`, so add `?bypass_ping=true` to that call (or first create a SurveyMonkey-type source named `surveymonkey`).

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- `@app.head` answers SurveyMonkey's URL check with `200`.
