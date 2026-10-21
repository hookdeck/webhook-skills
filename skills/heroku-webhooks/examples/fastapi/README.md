# Heroku Webhooks - FastAPI Example

Minimal example of receiving Heroku app webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Heroku app and the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) (`heroku-cli/6.13.19` or later)
- A webhook signing secret (chosen with `--secret`, or generated and shown once by `heroku webhooks:add`)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Heroku webhook secret to `.env`

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 heroku --path /webhooks/heroku
```

Then subscribe your app to the Hookdeck URL:

```bash
heroku webhooks:add -i api:release,api:build -l notify \
  -u https://hkdk.events/your-source-id -s "$HEROKU_WEBHOOK_SECRET" -a your-app
```

### Using ngrok

```bash
ngrok http 8000
```

Use the ngrok URL (plus `/webhooks/heroku`) as the `-u` value.

## Endpoint

- `POST /webhooks/heroku` - Verifies `Heroku-Webhook-Hmac-SHA256` and handles the event; replies `204`
