# Cyberimpact Webhooks - FastAPI Example

Minimal example of receiving Cyberimpact webhooks with FastAPI and authenticating them with the
secret header you add to the scenario's **Send a webhook** action.

Cyberimpact does not sign payloads, so there is no HMAC to verify. A dependency looks up the header
named in `CYBERIMPACT_WEBHOOK_HEADER` (default `Authorization`, case-insensitive) and compares its
whole value with `CYBERIMPACT_WEBHOOK_SECRET` using `hmac.compare_digest` on bytes. The route reads
the raw body, so any content type works, and parses it only after the check.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection. Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Cyberimpact account with marketing automation (see [../../references/setup.md](../../references/setup.md))

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

3. Set `CYBERIMPACT_WEBHOOK_HEADER` to the header key and `CYBERIMPACT_WEBHOOK_SECRET` to its exact
   value. Use a simple header name without spaces or special characters, such as `Authorization`.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/cyberimpact`.

Receive webhooks locally with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 cyberimpact --path /webhooks/cyberimpact
```

## Test

```bash
pytest test_webhook.py
```

The tests cover correct, wrong and missing credentials, custom header names, and the
`automation.webhook.send` event. No Cyberimpact account is needed.
