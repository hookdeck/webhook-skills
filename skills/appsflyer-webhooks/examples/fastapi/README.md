# AppsFlyer Webhooks - FastAPI Example

Minimal example of receiving AppsFlyer Push API (raw data) webhooks with
FastAPI and authenticating the custom authorization header. AppsFlyer doesn't
sign payloads, so the dependency compares the header value in constant time.

## Prerequisites

- Python 3.9+
- An AppsFlyer app with Push API configured using the **POST** method and a
  custom authorization header

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

3. Set `APPSFLYER_AUTH_TOKEN` to the header value you configured in AppsFlyer
   and, if it isn't `Authorization`, `APPSFLYER_AUTH_HEADER_NAME`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/appsflyer`.

## Test

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 appsflyer --path /webhooks/appsflyer
```

No account required. Paste the printed HTTPS URL as the Push API endpoint in
AppsFlyer.

## Notes

- The handler is in `main.py`; authentication is the `require_appsflyer_auth`
  dependency.
- There's no signature or timestamp, so deduplicate on `appsflyer_id` +
  `event_name` + `event_time`.
- See [../../references/verification.md](../../references/verification.md).
