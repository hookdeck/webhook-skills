# New Relic Webhooks - FastAPI Example

Minimal example of receiving New Relic alert webhooks and authenticating them with HTTP Basic
credentials.

New Relic does not sign payloads, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)` and compares the username and password in
constant time. A static credential authenticates the sender, not the body, and gives no replay
protection, so use HTTPS and rotate the credential if it leaks. The route reads the body with
`request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A New Relic Webhook destination with Basic authentication (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `NEW_RELIC_WEBHOOK_USERNAME` and `NEW_RELIC_WEBHOOK_PASSWORD` to the credentials on the destination.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/new-relic`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send each illustrative state with correct, wrong and malformed credentials. No New
Relic account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/new-relic \
  -u "$NEW_RELIC_WEBHOOK_USERNAME:$NEW_RELIC_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"issueId":"1","title":"High CPU","state":"ACTIVATED","acknowledged":false,"priority":"CRITICAL","issuePageUrl":"https://one.newrelic.com"}'
```

## Receive Webhooks Locally

New Relic can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 new-relic --path /webhooks/new-relic
```

Use the printed URL as the Endpoint URL of the Webhook destination.

## How It Works

- `main.py`: `verify_new_relic_request()` plus the `POST /webhooks/new-relic` route

1. The Basic credentials are checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The payload comes from your Handlebars template, so there is no fixed event field. This
   example uses an illustrative template and dispatches on New Relic's `state` (`CREATED`,
   `ACTIVATED`, `CLOSED`), with the `acknowledged` boolean (`isAcknowledged`) marking acknowledged issues.
4. It returns `200 {"received": true}`.
