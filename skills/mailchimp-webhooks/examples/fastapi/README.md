# Mailchimp Webhooks - FastAPI Example

Minimal example of receiving Mailchimp webhooks with FastAPI. Mailchimp does
**not** sign webhooks, so this endpoint is secured with an unguessable secret in
the URL query string (validated with a timing-safe `hmac.compare_digest`) and
answers Mailchimp's `GET` URL-validation ping with `200`.

## Prerequisites

- Python 3.9+
- A Mailchimp audience and a webhook URL secret you generate yourself

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

3. Set `MAILCHIMP_WEBHOOK_SECRET` in `.env` to a long random string
   (`openssl rand -hex 32`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

- URL validation: `GET  http://localhost:8000/webhooks/mailchimp` → `200`
- Event delivery: `POST http://localhost:8000/webhooks/mailchimp?secret=...`

## Local Development

Tunnel public webhooks to your local server with the Hookdeck CLI (no account
required):

```bash
npx hookdeck-cli listen 8000 mailchimp --path /webhooks/mailchimp
```

Register the resulting URL in Mailchimp with your secret appended:
`https://<tunnel-host>/webhooks/mailchimp?secret=<MAILCHIMP_WEBHOOK_SECRET>`

## Test

```bash
pytest test_webhook.py -v
```

The tests build real form-encoded Mailchimp payloads, exercise the GET URL
validation and bracket-notation parsing, and verify secret checking for every
event type (`subscribe`, `unsubscribe`, `profile`, `upemail`, `cleaned`,
`campaign`).
