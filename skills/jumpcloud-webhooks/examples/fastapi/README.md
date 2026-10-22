# JumpCloud Webhooks - FastAPI Example

Minimal example of receiving JumpCloud webhook channel notifications and authenticating them
with HTTP Basic auth.

JumpCloud does not sign payloads, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)` and compares the username and the password
each in constant time, evaluating both before deciding. The route reads the body with `request.body()`, so any content type works.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A JumpCloud webhook channel with Basic Authentication (see [../../references/setup.md](../../references/setup.md))

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

3. Set `JUMPCLOUD_WEBHOOK_USERNAME` and `JUMPCLOUD_WEBHOOK_PASSWORD` to the credentials you
   entered on the webhook channel.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/jumpcloud`.

## Test

```bash
pytest test_webhook.py
```

The tests send an illustrative alert body (JumpCloud documents the field names but no example
body) with correct, wrong, malformed and missing credentials. No JumpCloud account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/jumpcloud \
  -u "$JUMPCLOUD_WEBHOOK_USERNAME:$JUMPCLOUD_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"alert_id":"alert-0001","alert_title":"Illustrative alert","priority":"High","status":"Open"}'
```

(`-u` sends the credentials on the first request, which is what JumpCloud and Hookdeck expect.)

## Receive Webhooks Locally

JumpCloud can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 jumpcloud --path /webhooks/jumpcloud
```

Put the printed URL in the JumpCloud webhook channel, with the channel's Basic credentials
matching the ones on your Hookdeck source. The credentials must arrive on the first request: a `401` +
`WWW-Authenticate` challenge flow won't work through Hookdeck, which verifies the request as
received.

## How It Works

- `main.py`: `parse_basic_auth()`, `verify_jumpcloud_request()`, a `require_jumpcloud_basic_auth` dependency and the `POST /webhooks/jumpcloud` route

1. The `Authorization` header is checked before the body is parsed. Missing, malformed or
   mismatched credentials return `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler logs the alert fields (`alert_id`, `alert_title`, `priority`, `status`,
   `category`, `di_event`).
4. It returns `200 {"received": true}`.
